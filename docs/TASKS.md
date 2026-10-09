# Pelican Control Hub & Manager — Tasks & Feature Audit

เอกสารติดตามสถานะการพัฒนา ระบบทั้งหมดของ Pelican Bot & Pelican Manager
สถานะ: `[x]` = เสร็จสมบูรณ์ ใช้งานได้จริง 100% | `[/]` = ใช้งานได้บางส่วน (Partial) | `[ ]` = วางโครงสร้างไว้ (Draft/Scaffold)

---

## 1. Plan Script Workflow Engine (ระบบสร้างแผนบอทอัตโนมัติ)

| ระบบ / โหนด | สถานะ | รายละเอียดการทำงานจริง | การทดสอบ |
|---|:---:|---|:---:|
| **Trigger: Base Level** | `[x]` | อ่าน Base Level จาก Server State & HUD ทุก 5 วินาที เมื่อถึงเลเวลที่กำหนดจะสั่งรัน Action ทันที | Verified |
| **Trigger: Job Level** | `[x]` | อ่าน Job Level จาก Server State & HUD ทุก 5 วินาที เมื่อถึงเลเวลที่กำหนดจะสั่งรัน Action ทันที | Verified |
| **Action: Change Map** | `[x]` | เดินและวาร์ปเปลี่ยนแมพฟาร์มผ่าน NPC Alice / Pathfinding อัตโนมัติ (`window.setTargetFarmMap`) | Verified |
| **Action: Equip Item** | `[x]` | ตรวจจับอุปกรณ์บนตัว -> ตรวจในกระเป๋า -> สั่งสวมใส่ (`equip`) และหากไม่มีในกระเป๋า จะค้นหาในตลาดกลางพร้อมกดยืนยันสั่งซื้อชิ้นที่ถูกที่สุดตามงบให้อัตโนมัติ (`window.findAndEquipItemByName`) | Verified |
| **Action: Change Class** | `[x]` | ระบบเปลี่ยนอาชีพอัตโนมัติ: ตรวจสอบ Job Lv.10, เดินไปหา NPC Valkyrie (`n5`) หน้าปราสาทโซลเฮเวน (`1680, 1008`), ส่งแพ็กเก็ต `npc_talk` และเลือกเมนูอาชีพเป้าหมายผ่าน `npc_option` (`window.executeAutoJobChange`) | Verified (Client Dump & Packet Verified) |

---

## 2. Core Automation & Combat (ระบบบอทหลัก)

| ระบบ | สถานะ | รายละเอียด | การทดสอบ |
|---|:---:|---|:---:|
| **Auto Attack / Target Monster** | `[x]` | ล็อคมอนสเตอร์และโจมตี/ยิงธนูอัตโนมัติตามระยะ | Verified |
| **WASD & Backflip Movement** | `[x]` | ควบคุมการเดิน และสไลด์ถอยหลังเมื่อมอนสเตอร์เข้าใกล้ | Verified |
| **Auto Potions (HP / SP)** | `[x]` | กินยา Red / Orange / White / Blue Potion อัตโนมัติตาม % ที่ตั้งค่า | Verified |
| **Auto Buffs & Skills** | `[x]` | ร่ายสกิลบัฟตามรอบเวลาที่กำหนด (เช่น Double Strafe, Arrow Shower, Falcon) | Verified |
| **Auto Respawn & Return** | `[x]` | เมื่อตาย เกิดใหม่ที่เมือง และเดินกลับไปแมพฟาร์มเดิมผ่าน NPC Alice | Verified |

---

## 3. Inventory & Economy (กระเป๋าและเศรษฐกิจ)

| ระบบ | สถานะ | รายละเอียด | การทดสอบ |
|---|:---:|---|:---:|
| **Auto-Sort Bag** | `[x]` | จัดเรียงกระเป๋าอัตโนมัติ (`inv_sort`) | Verified |
| **Server Weight Sync & Auto Sell** | `[x]` | ตรวจสอบน้ำหนักเกิน 70% และขายขยะเข้า NPC ร้านค้าอัตโนมัติ | Verified |
| **Bag Whitelist Toggle** | `[x]` | ปุ่มล็อกไอเทมในกระเป๋าไม่ให้ถูกขายทิ้ง พร้อม Import / Export ข้ามจอ | Verified |
| **Auto Buy Supplies** | `[x]` | ซื้อลูกธนู / ยาแดง จากร้าน Tool Dealer ในเมืองอัตโนมัติเมื่อหมด | Verified |
| **Tooltip Guardian** | `[x]` | ระบบปกป้อง Tooltip จาก React Re-render และ Packet ตัดการแสดงผล | Verified |

---

## 4. Market & Trading Hub (ระบบตลาดกลาง)

| ระบบ | สถานะ | รายละเอียด | การทดสอบ |
|---|:---:|---|:---:|
| **Market Deep Scanner** | `[x]` | สแกนทุกหน้าในตลาดเพื่อดึงข้อมูลรายการและออฟชั่นไอเทม | Verified |
| **Market Sniper / Auto Buy** | `[x]` | ดักซื้อไอเทมราคาถูกหรือตรงตามออฟชั่นที่ตั้งไว้ทันทีเมื่อพบ | Verified |
| **Market Auto Sell (Median)** | `[x]` | ตั้งขายไอเทมอัตโนมัติตามราคา Median ของตลาด | Verified |
| **Stat / Affix Visualizer** | `[x]` | แสดงผล Badge ออฟชั่นสุ่มบนรายการไอเทมในตลาด | Verified |

---

## 5. Multi-Client Manager (หน้าควบคุมรวม Web UI)

| ระบบ | สถานะ | รายละเอียด | การทดสอบ |
|---|:---:|---|:---:|
| **Multi-Client State Monitoring** | `[x]` | แสดงสถานะ HP, SP, Map, Level, Zeny ของทุกจอพร้อมกัน | Verified |
| **Combined Zeny Metric** | `[x]` | คำนวณเงินรวมทุกตัวละครแสดงบน Header Bar | Verified |
| **Profile & Config Sync** | `[x]` | บันทึกและซิงค์การตั้งค่าบอทไปยังแต่ละ Client ผ่าน API | Verified |
| **Workflow Builder UI (n8n)** | `[x]` | หน้า UI สร้าง/แก้ไข/ลบ Trigger และ Action แบบลากต่อ Node | Verified |


---

## 6. Plan Script Automation & Progression (ระบบแผนการเล่นอัตโนมัติ)

| ระบบ | สถานะ | รายละเอียด | การทดสอบ |
|---|:---:|---|:---:|
| **Class 1 & Class 2 Built-in Selectors** | `[x]` | ช่อง Dropdown เลือกอาชีพ Class 1 (Job 10) และ Class 2 (Job 50) ในหน้าตั้งค่าแผน ไม่ต้องสร้าง Node เงื่อนไขเอง | Verified |
| **Auto Job Change Engine** | `[x]` | วิ่งไปคุยกับ NPC Valkyrie (n5) ในเมือง Solhaven เพื่อเปลี่ยนอาชีพให้อัตโนมัติเมื่อถึงเลเวล | Verified |
| **Per-Character Job Progression Cache** | `[x]` | จดจำสถานะเปลี่ยนอาชีพแยกตามชื่อตัวละคร (`pelican_job_state_<charName>`) ไม่ส่งแพ็กเก็ตซ้ำซ้อน ช่วยประหยัด CPU/Network | Verified |
| **Sequential Skill Allocator Engine** | `[x]` | วางแผนอัปแต้มสกิลตามลำดับคลิก (เช่น Class 1 = 9 แต้ม, Class 2 = 49 แต้ม) และบอทจะอัปสกิลตามคิวที่กำหนดทันทีเมื่อได้แต้มสกิล | Verified |
| **Stat Target & Priority Allocator** | `[x]` | กำหนดเป้าหมาย Status (STR, AGI, VIT, INT, DEX, LUK) พร้อมลำดับความสำคัญ (Priority Order) และอัปค่าอัตโนมัติ | Verified |
| **Game Classes & Skill Tree Database** | `[x]` | ฐานข้อมูลสกิลครบทั้ง 6 สายอาชีพหลักและอาชีพคลาส 2 (Archer, Hunter, Bard, Dancer, Swordsman, Knight, Crusader, Mage, Wizard, Sage, Thief, Assassin, Rogue, Acolyte, Priest, Monk, Merchant, Blacksmith, Alchemist) | Verified |

## 6. Game Patcher & Script Installer (ระบบติดตั้งและอัปเดตสคริปต์ลงตัวเกม)

| ฟีเจอร์ | สถานะ | รายละเอียดการทำงานจริง | การทดสอบ |
|---|:---:|---|:---:|
| **Auto-Detect Game Path** | `[x]` | ตรวจจับโฟลเดอร์ติดตั้งของเกม Aetheria Online อัตโนมัติ (`%LOCALAPPDATA%\Programs\Aetheria Online`) | Verified |
| **Windows Folder Browser Dialog** | `[x]` | เปิดหน้าต่างเลือกโฟลเดอร์ใน Windows (FolderBrowserDialog) เมื่อต้องการเลือกโฟลเดอร์ติดตั้งเอง | Verified |
| **1-Click Pelican Auto-Injector** | `[x]` | ติดตั้งตัวโหลด `resources/app/main.js` และสำเนา `bot.js` เข้าตัวเกมทันที โดยไม่ต้องแตกไฟล์เอง | Verified |
| **Original Backup & Restore** | `[x]` | สำรองไฟล์ดั้งเดิม `app.asar.original` และมีปุ่มกู้คืนกลับเป็นตัวเกมเดิมได้ทุกเมื่อ (1-Click Restore) | Verified |
| **Live Status & Integrity Hash** | `[x]` | ตรวจสอบความถูกต้องของสคริปต์ด้วย SHA256 Hash แจ้งสถานะว่าล่าสุดหรือมีอัปเดตใหม่ พร้อม Badge บน Header | Verified |
| **GitHub Online Update Checker** | `[x]` | เชื่อมต่อ GitHub API เช็ค Commit ล่าสุดเพื่อแจ้งเตือนเวอร์ชันของตัวบอท | Verified |
