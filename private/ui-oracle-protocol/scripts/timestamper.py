"""timestamper.py — mitmproxy 时间戳脚本（ui-oracle-protocol 配套）

给每个 flow 打上 epoch 毫秒时间戳（基于单调时钟外推，避免系统时间跳变
导致窗口切片错乱），并在请求头注入 X-Oracle-TS，供操作→请求映射表的
流量窗口切片使用。零依赖，Python 3.8+。

注意：X-Oracle-TS 注入对目标服务端可见，仅限回放/研究环境使用，
勿在对抗真实风控的链路中开启。

用法: mitmdump -s timestamper.py -p 8080
"""

import time

_monotonic_start = time.monotonic()
_epoch_start_ms = time.time() * 1000


def _ts_ms() -> int:
    """epoch 毫秒（单调时钟外推：启动时刻 epoch + 单调偏移）。

    用 epoch 而非相对偏移，便于与 Frida 设备端时间戳统一到同一
    毫秒级时钟做跨进程对齐。
    """
    return int(round(_epoch_start_ms + (time.monotonic() - _monotonic_start) * 1000))


def request(flow):
    flow.metadata["oracle_ts"] = _ts_ms()
    flow.request.headers["X-Oracle-TS"] = str(flow.metadata["oracle_ts"])


def response(flow):
    ts = flow.metadata.setdefault("oracle_ts", _ts_ms())
    flow.response.headers["X-Oracle-TS"] = str(ts)
    url = flow.request.pretty_url[:120]
    method = flow.request.method
    status = getattr(flow.response, "status_code", "-")
    # 供 CLI 人工核对: 时间戳 URL 方法 状态
    print(f"[oracle] t={ts} {method} {status} {url}")
