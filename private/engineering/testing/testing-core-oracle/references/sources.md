# Sources — 测试元包引用边界与真实文献索引

## 权威文献与真条目

- **Metamorphic Testing (蜕变测试)**:
  - T.Y. Chen, S.C. Cheung, S.M. Yiu: *Metamorphic Testing: A New Approach for Generating Next Test Cases* (HKUST TR, 1998)
  - T.Y. Chen, F.-C. Kuo, H. Liu, P.-L. Poon, D. Towey, T.H. Tse, Z.Q. Zhou: *Metamorphic Testing: A Review of Challenges and Opportunities* (ACM Computing Surveys, 51(1), 2018)
  - H. Liu, F.-C. Kuo, D. Towey, T.Y. Chen: *How Effectively Does Metamorphic Testing Alleviate the Oracle Problem?* (IEEE TSE, 40(1), 2014)
- **Property-Based Testing (基于性质的测试)**:
  - Koen Claessen & John Hughes: *QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs* (ACM SIGPLAN ICFP, 2000)
- **Design by Contract (契约式设计)**:
  - Bertrand Meyer: *Design by Contract* (Prentice Hall, 1991)
- **Consumer-Driven Contracts (消费者驱动契约)**:
  - Ian Robinson: *Consumer-Driven Contracts: A Service Evolution Pattern* (Martin Fowler Bliki, 2006)
- **边界解析与安全 (LangSec & Boundary Rigor)**:
  - Alexis King: *Parse, don't validate* (2019)
  - Martin Fowler: *Tolerant Reader* (2011) — 仅适用于已认证协作方内部字段级演进，严禁用于不可信外部边界或脏数据的语法豁免
  - L. Sassaman, M.L. Patterson, S. Bratus: *The Halting Problems of Network Stack Insecurity* (USENIX ;login:, 36(6), 2011)
  - L. Sassaman, M.L. Patterson, S. Bratus: *A Patch for Postel's Robustness Principle* (IEEE Security & Privacy, 10(2): 87–91, 2012)
  - L. Sassaman, M.L. Patterson, S. Bratus, M.E. Locasto: *Security Applications of Formal Language Theory* (IEEE Systems Journal, 7(3): 489–500, 2013)
  - M. Thomson & D. Schinazi: *Maintaining Robust Protocols* (IAB RFC 9413, 2023)
  - M. Rose: *Design and Implementation of the Blocks Extensible Exchange Protocol (BXXP)* (RFC 3117, 2001)
- **遗留系统表征与重构 (Characterization & Seam Testing)**:
  - Michael Feathers: *Working Effectively with Legacy Code* (Prentice Hall, 2004)
  - Ian Cooper: *TDD, Where Did It All Go Wrong* (DevTernity, 2017)
  - Kent Beck: *Test-Driven Development: By Example* (2002), *Canon TDD* (2023)

## 明确不纳入正文

- 将各时期、各层级方法强行拼接为「七大 *DD 代数完备家族谱」
- 将关系型预言机（Relational Oracle）误用为「控制反转公理」
- 将图像 SNR、色相容差等领域特定工程启发式上升为通用测试公理
- 将 Postel 原则作为安全公理在不可信边界推行宽容猜测
- 将 Typestate 静态编译约束混同于运行时行为预言机
