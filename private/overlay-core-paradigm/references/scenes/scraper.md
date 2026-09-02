# Scene delta — 爬虫 / 清洗管道

## 性能

限制并发与退避；禁止用真 sleep 测重试。活网不进默认 CI 墙钟。

## 韧性

429/503 走注入时钟的退避；死信可重放。同一批再入不爆炸主键。

## 隐私

fixture 去 cookie、token、个人信息。事件里 URL 用模板。

ToS / robots 是场景安全硬边界，不在本 Overlay 展开。
