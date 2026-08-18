"""timestamper.py — mitmproxy 时间戳脚本（ui-oracle-protocol 配套）

给每个 flow 打上单调递增的时间戳（毫秒），并在请求头注入 X-Oracle-TS，
供操作→请求映射表的流量窗口切片使用。零依赖，Python 3.8+。

用法: mitmdump -s timestamper.py -p 8080
"""

import time

_monotonic_start = time.monotonic()
_epoch_start = time.time() * 1000


def _ts_ms() -> int:
    """单调时钟毫秒（避免系统时间跳变导致窗口切片错乱）。"""
    return int(round((time.monotonic() - _monotonic_start) * 1000))


def request(flow):
    flow.metadata["oracle_ts"] = _ts_ms()
    flow.request.headers["X-Oracle-TS"] = str(flow.metadata["oracle_ts"])


def response(flow):
    flow.metadata.setdefault("oracle_ts", _ts_ms())
    flow.response.headers["X-Oracle-TS"] = str(flow.metadata["oracle_ts"])


def log(flow):
    """供 CLI 人工核对: 时间戳 URL 方法 状态。"""
    ts = flow.metadata.get("oracle_ts", "-")
    url = flow.request.pretty_url[:120]
    method = flow.request.method
    status = getattr(flow.response, "status_code", "-")
    print(f"[oracle] t={ts} {method} {status} {url}")
