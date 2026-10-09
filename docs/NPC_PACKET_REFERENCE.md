# Aetheria Online — NPC & Packet Data Reference

เอกสารรวบรวมข้อมูล NPC Keys, พิกัด (Coordinates), โครงสร้าง Packet Colyseus WebSocket และคำสั่งสนทนา สำหรับระบบบอทอัตโนมัติ **Pelican Bot & Manager**

---

## 1. Solhaven Capital NPC Registry (เมืองหลวงโซลเฮเวน)

| NPC Key | ชื่อ NPC | พิกัดโดยประมาณ (X, Y) | หน้าที่ & ฟังก์ชันหลัก | Packet Option Index |
|---|---|---|---|:---:|
| **`n1`** | **Storage** | เมืองหลวงโซลเฮเวน | คลังเก็บของส่วนตัว (ฝาก / ถอน ไอเทมและเงิน Zeny) | `0`: เปิดคลัง |
| **`n2`** | **Tool Dealer / Merchant** | เมืองหลวงโซลเฮเวน | ร้านค้าของชำ (ซื้อยาฟื้นฟู HP/SP, ลูกธนู Arrow, ขายขยะ NPC) | `0`: ซื้อของ, `1`: ขายของ |
| **`n3`** | **Equipment Dealer** | เมืองหลวงโซลเฮเวน | ร้านจำหน่ายอุปกรณ์สวมใส่และอาวุธระดับเริ่มต้น | `0`: ร้านค้า |
| **`n4`** | **Blacksmith Enok** | เมืองหลวงโซลเฮเวน | ช่างตีเหล็ก (ตีบวก/อัปเกรด Refine อุปกรณ์, ซ่อมแซม) | `0`: ตีบวก |
| **`n5`** | **Class Guide / Assistant** | เมืองหลวงโซลเฮเวน | ผู้ช่วยแนะนำระบบคลาสและสกิล | `0`: บทสนทนา |
| **`n6`** | **Valkyrie** | `1680, 1008` (หน้าปราสาท) | **NPC เปลี่ยนอาชีพ**: Novice -> Class 1 (Archer, Swordsman, etc.) และ Class 1 -> Class 2 (Hunter, Knight, etc.) | `0`: เปลี่ยนอาชีพ |
| **`n7`** | **Alice Service** | `1632, 1696` (ข้างน้ำพุใจกลางเมือง) | **Alice Warp Service**: บันทึกจุดเกิด, วาร์ปด่วนไปแมพฟาร์ม, และฮีลฟื้นฟู HP/SP | `1`: **เปิดแผนที่วาร์ป (Warp Service)**<br>`3`: **ฟื้นฟูเลือดและมานา (Heal)** |

> **⚠️ ข้อควรระวังสำคัญ (Critical Gotcha):**
> - **`n6` คือ Valkyrie (เปลี่ยนอาชีพ)** ห้ามส่ง `n6` เมื่อต้องการใช้งาน Alice Service เด็ดขาด มิฉะนั้นตัวละครจะไปเปิดหน้าต่างเปลี่ยนอาชีพแทน!
> - **`n7` คือ Alice Service (วาร์ปเกตด่วน / ฮีล)** ตัวจริงข้างน้ำพุ!

---

## 2. Colyseus Packet Protocol & Hex Payloads

ระบบการส่งข้อมูลระหว่าง Client กับ Game Server ใช้ Colyseus Protocol ผ่าน WebSocket:
- **Client Frame Opcode:** `0x0D`
- **Serialization:** MessagePack (`msgpack`)

### 2.1 คำสั่งเริ่มคุยกับ NPC (`npc_talk`)
- **Action Type:** `npc_talk`
- **Payload Structure:** `{ npcKey: string }`
- **Packet Format:**
  `0x0D` + MsgPack fixstr(8) `"npc_talk"` + MoveToken (3 bytes) + MsgPack Map(1) `{"npcKey": "n7"}`

**ตัวอย่าง Hex Packet (คุยกับ Alice Service `n7`):**
```
0d a8 6e 70 63 5f 74 61 6c 6b d4 72 40 91 a6 6e 70 63 4b 65 79 a2 6e 37
```
- `0d` = Opcode
- `a8 6e 70 63 5f 74 61 6c 6b` = `"npc_talk"`
- `d4 72 40` = Client Token
- `91` = Map (1 key)
- `a6 6e 70 63 4b 65 79` = `"npcKey"`
- `a2 6e 37` = `"n7"`

---

### 2.2 คำสั่งเลือกเมนูสนทนา (`npc_option`)
- **Action Type:** `npc_option`
- **Payload Structure:** `{ index: number }`

**ตัวอย่าง Hex Packet (เปิดแผนที่วาร์ป Alice Service - Option Index 1):**
```
0d aa 6e 70 63 5f 6f 70 74 69 6f 6e d4 72 40 91 a5 69 6e 64 65 78 01
```
- `0d` = Opcode
- `aa 6e 70 63 5f 6f 70 74 69 6f 6e` = `"npc_option"`
- `d4 72 40` = Client Token
- `91` = Map (1 key)
- `a5 69 6e 64 65 78` = `"index"`
- `01` = Integer `1` (เปิด Alice Warp Service)

**ตัวอย่าง Option Index 3 (ฮีลฟื้นฟูเลือด/มานาฟรีที่ Alice):**
```
0d aa 6e 70 63 5f 6f 70 74 69 6f 6e d4 72 40 91 a5 69 6e 64 65 78 03
```

---

### 2.3 คำสั่งวาร์ปตรงผ่าน Alice Service (`npc_warp`)
เมื่อเปิดหน้าต่างแผนที่วาร์ปของ Alice Service สำเร็จ:
- **Action Type:** `npc_warp`
- **Payload Structure:** `{ mapId: string }`

**ตัวอย่าง:**
```javascript
room.send('npc_warp', { mapId: 'moonleaf_forest' });
```

---

### 2.4 คำสั่งปิดหน้าต่าง NPC (`npc_close`)
- **Action Type:** `npc_close`
- **Payload Structure:** `{}`

```javascript
room.send('npc_close', {});
```

---

## 3. Dynamic In-Game Inspection & Dumper

ในตัวบอท Pelican Bot มีฟังก์ชันดึงรายชื่อ NPC สดจาก Colyseus Room State (`room.state.npcs`):
```javascript
// ดึงรายชื่อ NPC ทั้งหมดในแมพปัจจุบัน
const npcs = window.dumpNpcData();

// ค้นหา NPC ตามชื่อ
const alice = window.findNpcByName('Alice');
console.log('Alice Key:', alice.key, 'Position:', alice.x, alice.y);
```
หรือกดปุ่ม **`👥 Dump NPC (รายชื่อ, Key & พิกัดทั้งหมด)`** ในแท็บ **⚙️ ตั้งค่า (System)** ของ Pelican HUD
