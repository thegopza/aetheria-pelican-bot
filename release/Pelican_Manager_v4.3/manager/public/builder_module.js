// ==========================================================================
// PLAN SCRIPT: AUTO CLASS SELECTION, SKILL BUILDER & STAT BUILDER ENGINE
// ==========================================================================

const CLASS_TREE_MAP = {
  archer: {
    name: 'Archer (นักธนู)',
    secondClasses: [
      { id: 'hunter', name: 'Hunter (นักล่า)' },
      { id: 'bard', name: 'Bard (กวี)' },
      { id: 'dancer', name: 'Dancer (นักเต้น)' }
    ]
  },
  swordsman: {
    name: 'Swordsman (นักดาบ)',
    secondClasses: [
      { id: 'knight', name: 'Knight (อัศวิน)' },
      { id: 'crusader', name: 'Crusader (ครูเซเดอร์)' }
    ]
  },
  mage: {
    name: 'Mage (นักเวท)',
    secondClasses: [
      { id: 'wizard', name: 'Wizard (จอมเวท)' },
      { id: 'sage', name: 'Sage (นักปราชญ์)' }
    ]
  },
  thief: {
    name: 'Thief (โจร)',
    secondClasses: [
      { id: 'assassin', name: 'Assassin (นักฆ่า)' },
      { id: 'rogue', name: 'Rogue (โร้ก)' }
    ]
  },
  acolyte: {
    name: 'Acolyte (นักบวชฝึกหัด)',
    secondClasses: [
      { id: 'priest', name: 'Priest (พรีสต์)' },
      { id: 'monk', name: 'Monk (มองค์)' }
    ]
  },
  merchant: {
    name: 'Merchant (พ่อค้า)',
    secondClasses: [
      { id: 'blacksmith', name: 'Blacksmith (ช่างตีเหล็ก)' },
      { id: 'alchemist', name: 'Alchemist (นักเล่นแร่แปรธาตุ)' }
    ]
  }
};

const SKILLS_DATABASE = {
  novice: [
    { id: 'basic-skill', name: "Adventurer's Instinct", thai: "ทักษะพื้นฐาน", maxLevel: 9, kind: 'passive', desc: 'เงื่อนไขสำคัญสำหรับเปลี่ยนอาชีพ Class 1 (ต้องอัปเต็ม 9)' },
    { id: 'first-aid', name: "Field Mend", thai: "ปฐมพยาบาล", maxLevel: 1, kind: 'active', desc: 'ฟื้นฟู HP เล็กน้อยทันที' }
  ],
  archer: [
    { id: 'owl-eye', name: "Keen Eye", thai: "ตานกฮูก", maxLevel: 10, kind: 'passive', desc: 'เพิ่มค่า DEX อย่างถาวร' },
    { id: 'vulture-eye', name: "Eagle Sight", thai: "ตาแร้ง", maxLevel: 10, kind: 'passive', req: 'Keen Eye Lv.3', desc: 'เพิ่มระยะยิงธนูและความแม่นยำ' },
    { id: 'double-strafe', name: "Twin Shot", thai: "ยิงคู่", maxLevel: 10, kind: 'active', desc: 'ยิงลูกธนู 2 ดอกใส่เป้าหมายอย่างรวดเร็ว' },
    { id: 'arrow-shower', name: "Arrow Rain", thai: "ฝนธนู", maxLevel: 10, kind: 'active', req: 'Twin Shot Lv.5', desc: 'ยิงห่าฝนธนูโจมตีหมู่รอบพื้นที่' },
    { id: 'improve-concentration', name: "Hunter's Focus", thai: "เพิ่มสมาธิ", maxLevel: 10, kind: 'active', req: 'Eagle Sight Lv.1', desc: 'บัฟเพิ่มค่า AGI และ DEX ชั่วคราว' }
  ],
  hunter: [
    { id: 'falconry-mastery', name: "Falcon Bond", thai: "ฝึกเหยี่ยว", maxLevel: 1, kind: 'passive', desc: 'เช่าและควบคุมนกเหยี่ยวผู้ซื่อสัตย์' },
    { id: 'blitz-beat', name: "Falcon Strike", thai: "เหยี่ยวจู่โจม", maxLevel: 10, kind: 'active', req: 'Falcon Bond Lv.1', desc: 'สั่งเหยี่ยวบินโฉบโจมตีเป้าหมายและรอบข้าง' },
    { id: 'auto-blitz-beat', name: "Falcon Instinct", thai: "เหยี่ยวจู่โจมอัตโนมัติ", maxLevel: 5, kind: 'passive', req: 'Falcon Bond Lv.1', desc: 'เหยี่ยวมีโอกาสบินโจมตีเองอัตโนมัติตามค่า LUK' },
    { id: 'steel-crow', name: "Steel Talons", thai: "กรงเล็บเหล็ก", maxLevel: 10, kind: 'passive', req: 'Falcon Strike Lv.5', desc: 'เพิ่มพลังโจมตีของเหยี่ยวทุกรูปแบบ' },
    { id: 'land-mine', name: "Blast Mine", thai: "กับระเบิด", maxLevel: 10, kind: 'active', desc: 'วางกับดักระเบิดธาตุดิน' },
    { id: 'ankle-snare', name: "Snare Trap", thai: "กับดักข้อเท้า", maxLevel: 10, kind: 'active', req: 'Blast Mine Lv.1', desc: 'ตรึงเป้าหมายให้อยู่กับที่ชั่วขณะ' },
    { id: 'claymore-trap', name: "Inferno Trap", thai: "กับดักเพลิง", maxLevel: 10, kind: 'active', req: 'Blast Mine Lv.3', desc: 'วางกับดักระเบิดเพลิงเผาผลาญศัตรู' },
    { id: 'detecting', name: "Falcon Scout", thai: "เหยี่ยวสอดแนม", maxLevel: 1, kind: 'active', req: 'Falcon Bond Lv.1', desc: 'ใช้นกเหยี่ยวตรวจหาศัตรูที่พรางตัว' }
  ],
  bard: [
    { id: 'musical-strike', name: "Musical Strike", thai: "โน้ตสังหาร", maxLevel: 10, kind: 'active', desc: 'ดีดเครื่องดนตรีปล่อยคลื่นเสียงโจมตีศัตรู' },
    { id: 'poem-of-bragi', name: "Poem of Bragi", thai: "บทเพลงแห่งบรากิ", maxLevel: 10, kind: 'active', desc: 'ลดเวลาการร่ายเวทและคูลดาวน์สกิลแก่ปาร์ตี้' },
    { id: 'assassin-cross-of-sunset', name: "Sunset Cross", thai: "บทเพลงซันเซ็ต", maxLevel: 10, kind: 'active', desc: 'เพิ่มความเร็วการโจมตี (ASPD) แก่ปาร์ตี้' },
    { id: 'apple-of-idun', name: "Apple of Idun", thai: "แอปเปิ้ลแห่งอิดุน", maxLevel: 10, kind: 'active', desc: 'เพิ่ม Max HP และฟื้นฟูเลือดแก่ปาร์ตี้' },
    { id: 'frost-joke', name: "Frost Joke", thai: "มุกแป้กแช่แข็ง", maxLevel: 5, kind: 'active', desc: 'เล่นมุกตลกแช่แข็งศัตรูทั้งหน้าจอ' }
  ],
  dancer: [
    { id: 'throw-arrow', name: "Throw Arrow", thai: "ปาลูกธนู", maxLevel: 10, kind: 'active', desc: 'ปาลูกธนูโจมตีศัตรูเป้าหมายเดี่ยว' },
    { id: 'service-for-you', name: "Service For You", thai: "เซอร์วิสฟอร์ยู", maxLevel: 10, kind: 'active', desc: 'เพิ่ม Max SP และลดการใช้ SP ของปาร์ตี้' },
    { id: 'fortune-kiss', name: "Fortune's Kiss", thai: "จูบแห่งโชค", maxLevel: 10, kind: 'active', desc: 'เพิ่มอัตราคริติคอลอย่างมหาศาล' },
    { id: 'scream', name: "Scream", thai: "กรีดร้องสตั๊น", maxLevel: 5, kind: 'active', desc: 'กรีดร้องทำให้ศัตรูรอบตัวติดสตั๊น' }
  ],
  swordsman: [
    { id: 'sword-mastery', name: "Sword Mastery", thai: "ชำนาญดาบมือเดียว", maxLevel: 10, kind: 'passive', desc: 'เพิ่มพลังโจมตีเมื่อถือดาบมือเดียว' },
    { id: 'two-hand-sword-mastery', name: "Two-Hand Sword", thai: "ชำนาญดาบสองมือ", maxLevel: 10, kind: 'passive', desc: 'เพิ่มพลังโจมตีดาบสองมือ' },
    { id: 'hp-recovery', name: "HP Recovery", thai: "ฟื้นฟู HP ไว", maxLevel: 10, kind: 'passive', desc: 'เร่งการฟื้นฟู HP ขณะยืนนิ่ง' },
    { id: 'bash', name: "Bash", thai: "ฟาดฟัน", maxLevel: 10, kind: 'active', desc: 'ฟาดฟันอย่างรุนแรงใส่เป้าหมาย' },
    { id: 'magnum-break', name: "Magnum Break", thai: "ระเบิดเพลิง", maxLevel: 10, kind: 'active', req: 'Bash Lv.5', desc: 'ระเบิดเพลิงรอบตัวและเพิ่มพลังโจมตีธาตุไฟ' },
    { id: 'provoke', name: "Provoke", thai: "ยั่วยุ", maxLevel: 10, kind: 'active', desc: 'ยั่วยุศัตรูลดพลังป้องกันแต่เพิ่มพลังโจมตี' },
    { id: 'endure', name: "Endure", thai: "อดทน", maxLevel: 10, kind: 'active', req: 'Provoke Lv.5', desc: 'เดินทะลุการโจมตีไม่กระตุกและเพิ่ม MDef' }
  ],
  knight: [
    { id: 'two-hand-quicken', name: "Two-Hand Quicken", thai: "เร่งฟันดาบสองมือ", maxLevel: 10, kind: 'active', desc: 'เพิ่มความเร็วการโจมตี (ASPD) 30% ทันที' },
    { id: 'bowling-bash', name: "Bowling Bash", thai: "โบลิ่งบาช", maxLevel: 10, kind: 'active', desc: 'ฟาดศัตรูกระเด็นชนต่อกันทำดาเมจมหาศาล' },
    { id: 'peco-peco-ride', name: "Peco Peco Ride", thai: "ขี่เปโกะ", maxLevel: 1, kind: 'passive', desc: 'ขี่สัตว์พาหนะเปโกะเพิ่มความเร็วเดิน' },
    { id: 'spear-mastery', name: "Spear Mastery", thai: "ชำนาญหอก", maxLevel: 10, kind: 'passive', desc: 'เพิ่มพลังโจมตีเมื่อใช้อาวุธหอก' },
    { id: 'pierce', name: "Pierce", thai: "แทงทะลวง", maxLevel: 10, kind: 'active', desc: 'แทงรัวหลายฮิตตามขนาดศัตรู' },
    { id: 'brandish-spear', name: "Brandish Spear", thai: "กวาดหอก", maxLevel: 10, kind: 'active', desc: 'กวาดหอกโจมตีศัตรูรูปพัดด้านหน้า' }
  ],
  crusader: [
    { id: 'faith', name: "Faith", thai: "ศรัทธา", maxLevel: 10, kind: 'passive', desc: 'เพิ่ม Max HP และความต้านทานธาตุแสง' },
    { id: 'auto-guard', name: "Auto Guard", thai: "การ์ดป้องกันอัตโนมัติ", maxLevel: 10, kind: 'active', desc: 'ยกโล่บล็อกการโจมตีกายภาพ' },
    { id: 'shield-charge', name: "Shield Charge", thai: "กระแทกโล่", maxLevel: 5, kind: 'active', desc: 'กระแทกโล่ทำให้ศัตรูกระเด็นและติดสตั๊น' },
    { id: 'shield-boomerang', name: "Shield Boomerang", thai: "บูมเมอแรงโล่", maxLevel: 5, kind: 'active', desc: 'ขว้างโล่โจมตีศัตรูระยะไกลตามน้ำหนักโล่' },
    { id: 'holy-cross', name: "Holy Cross", thai: "กางเขนศักดิ์สิทธิ์", maxLevel: 10, kind: 'active', desc: 'ฟันรูปไม้กางเขนธาตุแสงใส่ศัตรู' },
    { id: 'grand-cross', name: "Grand Cross", thai: "แกรนด์ครอส", maxLevel: 10, kind: 'active', desc: 'ระเบิดกางเขนแสงศักดิ์สิทธิ์รอบตัว' }
  ],
  mage: [
    { id: 'sp-recovery', name: "SP Recovery", thai: "ฟื้นฟู SP ไว", maxLevel: 10, kind: 'passive', desc: 'เร่งการฟื้นฟูค่า SP ขณะยืนนิ่ง' },
    { id: 'fire-bolt', name: "Fire Bolt", thai: "ศรเพลิง", maxLevel: 10, kind: 'active', desc: 'ยิงลูกศรเพลิงหลายดอกใส่เป้าหมาย' },
    { id: 'cold-bolt', name: "Cold Bolt", thai: "ศรน้ำแข็ง", maxLevel: 10, kind: 'active', desc: 'ยิงลูกศรเยือกแข็งหลายดอกใส่เป้าหมาย' },
    { id: 'lightning-bolt', name: "Lightning Bolt", thai: "สายฟ้าฟาด", maxLevel: 10, kind: 'active', desc: 'ผ่าสายฟ้าฟาดใส่เป้าหมาย' },
    { id: 'soul-strike', name: "Soul Strike", thai: "วิญญาณสังหาร", maxLevel: 10, kind: 'active', desc: 'ยิงกระสุนวิญญาณรวดเร็วใส่เป้าหมาย' },
    { id: 'frost-diver', name: "Frost Diver", thai: "คลื่นเยือกแข็ง", maxLevel: 10, kind: 'active', req: 'Cold Bolt Lv.5', desc: 'ปล่อยคลื่นเยือกแข็งแช่แข็งศัตรู' },
    { id: 'safety-wall', name: "Safety Wall", thai: "กำแพงคุ้มภัย", maxLevel: 10, kind: 'active', desc: 'สร้างม่านพลังป้องกันการโจมตีกายภาพ' }
  ],
  wizard: [
    { id: 'storm-gust', name: "Storm Gust", thai: "พายุน้ำแข็ง", maxLevel: 10, kind: 'active', desc: 'ร่ายพายุหิมะซัดกระเด็นและแช่แข็งศัตรู' },
    { id: 'lord-of-vermilion', name: "Lord of Vermilion", thai: "พายุอัสนีบาต", maxLevel: 10, kind: 'active', desc: 'เรียกพายุสายฟ้าถล่มพื้นที่เป็นวงกว้าง' },
    { id: 'meteor-storm', name: "Meteor Storm", thai: "ฝนอุกกาบาต", maxLevel: 10, kind: 'active', desc: 'เรียกอุกกาบาตเพลิงตกลงมาสร้างความเสียหายมหาศาล' },
    { id: 'jupitel-thunder', name: "Jupitel Thunder", thai: "จูปิเตอร์ธันเดอร์", maxLevel: 10, kind: 'active', desc: 'ยิงบอลสายฟ้าผลักกระเด็นทำความเสียหายรัว' },
    { id: 'quagmire', name: "Quagmire", thai: "โคลนดูด", maxLevel: 5, kind: 'active', desc: 'สร้างบึงโคลนดูดลดความเร็วเดิน, AGI และ DEX' },
    { id: 'earth-spike', name: "Earth Spike", thai: "เสาหินทิ่มแทง", maxLevel: 5, kind: 'active', desc: 'เรียกแท่งหินพุ่งขึ้นมาทิ่มแทงศัตรู' },
    { id: 'heavens-drive', name: "Heaven's Drive", thai: "แผ่นดินสะเทือน", maxLevel: 5, kind: 'active', desc: 'ทำให้แผ่นดินไหวโจมตีศัตรูในพื้นที่' }
  ],
  thief: [
    { id: 'double-attack', name: "Double Attack", thai: "โจมตีสองจังหวะ", maxLevel: 10, kind: 'passive', desc: 'มีโอกาสโจมตีเบิ้ล 2 ครั้งเมื่อใช้มีด' },
    { id: 'improve-dodge', name: "Flee Mastery", thai: "ชำนาญหลบหลีก", maxLevel: 10, kind: 'passive', desc: 'เพิ่มอัตราการหลบหลีก (Flee) อย่างถาวร' },
    { id: 'steal', name: "Steal", thai: "ขโมยของ", maxLevel: 10, kind: 'active', desc: 'ขโมยไอเทมจากมอนสเตอร์' },
    { id: 'hiding', name: "Hiding", thai: "ซ่อนตัว", maxLevel: 10, kind: 'active', desc: 'ซ่อนตัวใต้ดินหลบสายตาศัตรู' },
    { id: 'envenom', name: "Envenom", thai: "พิษสังหาร", maxLevel: 10, kind: 'active', desc: 'โจมตีด้วยพิษทำให้ติดสถานะพิษ' },
    { id: 'back-slide', name: "Back Slide", thai: "สไลด์ถอยหลัง", maxLevel: 1, kind: 'active', desc: 'สไลด์ถอยหลัง 5 ช่องอย่างรวดเร็ว' }
  ],
  assassin: [
    { id: 'katar-mastery', name: "Katar Mastery", thai: "ชำนาญกาตาร์", maxLevel: 10, kind: 'passive', desc: 'เพิ่มพลังโจมตีเมื่อใช้อาวุธประเภทกาตาร์' },
    { id: 'sonic-blow', name: "Sonic Blow", thai: "โซนิคโบลว์", maxLevel: 10, kind: 'active', desc: 'ฟันรัว 8 ครั้งอย่างรวดเร็วและมีโอกาสติดสตั๊น' },
    { id: 'grimtooth', name: "Grimtooth", thai: "กริมทูธ", maxLevel: 5, kind: 'active', desc: 'โจมตีศัตรูระยะไกลขณะซ่อนตัวใต้ดิน' },
    { id: 'enchant-poison', name: "Enchant Poison", thai: "เคลือบพิษ", maxLevel: 10, kind: 'active', desc: 'เคลือบพิษใส่อาวุธโจมตีเป็นธาตุพิษ' },
    { id: 'venom-dust', name: "Venom Dust", thai: "หมอกพิษ", maxLevel: 10, kind: 'active', desc: 'โปรยหมอกพิษใส่พื้นที่ศัตรูที่เหยียบจะติดพิษ' },
    { id: 'cloaking', name: "Cloaking", thai: "พรางกาย", maxLevel: 10, kind: 'active', desc: 'เดินพรางกายเลียบกำแพงโดยไม่ถูกตรวจพบ' }
  ],
  acolyte: [
    { id: 'heal', name: "Heal", thai: "รักษาฟื้นฟู", maxLevel: 10, kind: 'active', desc: 'ฟื้นฟู HP ให้ตนเองหรือเพื่อนร่วมทีม' },
    { id: 'increase-agi', name: "Increase AGI", thai: "เร่งความเร็ว", maxLevel: 10, kind: 'active', req: 'Heal Lv.2', desc: 'เพิ่มค่า AGI และความเร็วในการเดิน' },
    { id: 'blessing', name: "Blessing", thai: "อวยพรเทพ", maxLevel: 10, kind: 'active', req: 'Divine Protection Lv.5', desc: 'เพิ่มค่า STR, INT, DEX อย่างละ 10' },
    { id: 'divine-protection', name: "Divine Protection", thai: "คุ้มกันศักดิ์สิทธิ์", maxLevel: 10, kind: 'passive', desc: 'ลดความเสียหายจากมอนสเตอร์ Undead และ Demon' },
    { id: 'pneuma', name: "Pneuma", thai: "เกราะวายุ", maxLevel: 1, kind: 'active', desc: 'สร้างเกราะป้องกันการโจมตีระยะไกลทุกชนิด' },
    { id: 'holy-light', name: "Holy Light", thai: "แสงศักดิ์สิทธิ์", maxLevel: 1, kind: 'active', desc: 'ยิงลำแสงศักดิ์สิทธิ์ธาตุแสงใส่ศัตรู' }
  ],
  priest: [
    { id: 'kyrie-eleison', name: "Kyrie Eleison", thai: "เกราะป้องกันกายภาพ", maxLevel: 10, kind: 'active', desc: 'สร้างบาเรียคุ้มกันบล็อกการโจมตีกายภาพ' },
    { id: 'magnus-exorcismus', name: "Magnus Exorcismus", thai: "วงแหวนขับไล่ปีศาจ", maxLevel: 10, kind: 'active', desc: 'สร้างวงแหวนศักดิ์สิทธิ์ทำลายล้าง Undead/Demon' },
    { id: 'gloria', name: "Gloria", thai: "กลอเรีย", maxLevel: 5, kind: 'active', desc: 'เพิ่มค่า LUK +30 ให้ปาร์ตี้ทั้งหมด' },
    { id: 'impositio-manus', name: "Impositio Manus", thai: "เพิ่มพลังโจมตีอาวุธ", maxLevel: 5, kind: 'active', desc: 'เพิ่มพลังโจมตีกายภาพโดยตรงแก่อาวุธ' },
    { id: 'aspersio', name: "Aspersio", thai: "เคลือบธาตุแสง", maxLevel: 5, kind: 'active', desc: 'เปลี่ยนธาตุอาวุธให้เป็นธาตุแสง' },
    { id: 'sanctuary', name: "Sanctuary", thai: "แซงชัวรี", maxLevel: 10, kind: 'active', desc: 'สร้างพื้นที่ฟื้นฟู HP ให้ทุกคนในรัศมี' },
    { id: 'resurrection', name: "Resurrection", thai: "ชุบชีวิต", maxLevel: 4, kind: 'active', desc: 'ชุบชีวิตเพื่อนร่วมทีมที่เสียชีวิต' }
  ],
  merchant: [
    { id: 'enlarge-weight', name: "Enlarge Weight", thai: "แบกน้ำหนักเพิ่ม", maxLevel: 10, kind: 'passive', desc: 'เพิ่มขีดจำกัดน้ำหนักกระเป๋า' },
    { id: 'discount', name: "Discount", thai: "ส่วนลดร้านค้า", maxLevel: 10, kind: 'passive', desc: 'ซื้อไอเทมจาก NPC ถูกลงสูงสุด 24%' },
    { id: 'over-thrust', name: "Over Thrust", thai: "เพิ่มพลังอาวุธ", maxLevel: 10, kind: 'active', desc: 'เพิ่มพลังโจมตีของปาร์ตี้อย่างมหาศาล' },
    { id: 'mammonite', name: "Mammonite", thai: "ฟาดด้วยเงิน", maxLevel: 10, kind: 'active', desc: 'จ่าย Zeny ฟาดศัตรูทำดาเมจ 600%' },
    { id: 'loud-exclamation', name: "Shout", thai: "ตะโกนฮึกเหิม", maxLevel: 1, kind: 'active', desc: 'ตะโกนเพิ่มค่า STR +4' }
  ],
  blacksmith: [
    { id: 'adrenaline-rush', name: "Adrenaline Rush", thai: "อะดรีนาลีนเร่งตี", maxLevel: 5, kind: 'active', desc: 'เพิ่มความเร็วการโจมตี (ASPD) 30% เมื่อใช้ขวาน/ค้อน' },
    { id: 'weapon-perfection', name: "Weapon Perfection", thai: "อาวุธไร้ขนาด", maxLevel: 5, kind: 'active', desc: 'ทำดาเมจ 100% ใส่มอนสเตอร์ทุกขนาด (เล็ก กลาง ใหญ่)' },
    { id: 'hammer-fall', name: "Hammer Fall", thai: "ค้อนสตั๊น", maxLevel: 5, kind: 'active', desc: 'ฟาดค้อนลงพื้นทำให้ศัตรูรอบข้างติดสตั๊น' },
    { id: 'weaponry-research', name: "Weaponry Research", thai: "วิจัยอาวุธ", maxLevel: 10, kind: 'passive', desc: 'เพิ่มพลังโจมตีและความแม่นยำอย่างถาวร' }
  ]
};

let currentSkillBuilderTab = 'novice';

// 1. Update Class 1 and Class 2 Dropdowns in Plan Editor
function updateClassDropdownsInEditor() {
  const c1Sel = document.getElementById("plan-editor-class1");
  const c2Sel = document.getElementById("plan-editor-class2");
  if (!c1Sel || !c2Sel || !activeEditingPlan) return;

  const currentC1 = activeEditingPlan.class1Target || 'archer';
  c1Sel.value = currentC1;

  const tree = CLASS_TREE_MAP[currentC1] || CLASS_TREE_MAP['archer'];
  c2Sel.innerHTML = tree.secondClasses.map(sc => `
    <option value="${sc.id}">${sc.name}</option>
  `).join('');

  if (activeEditingPlan.class2Target && tree.secondClasses.some(sc => sc.id === activeEditingPlan.class2Target)) {
    c2Sel.value = activeEditingPlan.class2Target;
  } else {
    activeEditingPlan.class2Target = tree.secondClasses[0].id;
    c2Sel.value = activeEditingPlan.class2Target;
  }

  c1Sel.onchange = () => {
    activeEditingPlan.class1Target = c1Sel.value;
    const newTree = CLASS_TREE_MAP[c1Sel.value] || CLASS_TREE_MAP['archer'];
    c2Sel.innerHTML = newTree.secondClasses.map(sc => `
      <option value="${sc.id}">${sc.name}</option>
    `).join('');
    activeEditingPlan.class2Target = newTree.secondClasses[0].id;
    c2Sel.value = activeEditingPlan.class2Target;
    updatePlanEditorBadges();
  };

  c2Sel.onchange = () => {
    activeEditingPlan.class2Target = c2Sel.value;
    updatePlanEditorBadges();
  };
}

// 2. Update Plan Editor Badges (Skill count and Stat summary)
function updatePlanEditorBadges() {
  if (!activeEditingPlan) return;
  const skillBadge = document.getElementById("plan-skill-count-badge");
  const statBadge = document.getElementById("plan-stat-summary-badge");

  if (skillBadge) {
    const queue = activeEditingPlan.skillBuild?.skillPointQueue || [];
    skillBadge.innerText = `${queue.length} แต้ม`;
    skillBadge.style.background = queue.length > 0 ? 'rgba(168, 85, 247, 0.4)' : 'rgba(168, 85, 247, 0.2)';
  }

  if (statBadge) {
    const sb = activeEditingPlan.statBuild?.targets;
    if (sb) {
      statBadge.innerText = `DEX ${sb.DEX || 1} / AGI ${sb.AGI || 1}`;
      statBadge.style.background = 'rgba(56, 189, 248, 0.4)';
    } else {
      statBadge.innerText = 'Default';
      statBadge.style.background = 'rgba(56, 189, 248, 0.2)';
    }
  }
}

// 3. Open Skill Builder Modal
function openSkillBuilderModal() {
  if (!activeEditingPlan) return;
  if (!activeEditingPlan.skillBuild) {
    activeEditingPlan.skillBuild = { skillPointQueue: [], plannedLevels: {} };
  }
  if (!Array.isArray(activeEditingPlan.skillBuild.skillPointQueue)) {
    activeEditingPlan.skillBuild.skillPointQueue = [];
  }
  if (!activeEditingPlan.skillBuild.plannedLevels) {
    activeEditingPlan.skillBuild.plannedLevels = {};
  }

  // Update Tab Names
  const c1NameEl = document.getElementById("skill-tab-class1-name");
  const c2NameEl = document.getElementById("skill-tab-class2-name");
  const c1 = activeEditingPlan.class1Target || 'archer';
  const c2 = activeEditingPlan.class2Target || 'hunter';

  if (c1NameEl) c1NameEl.innerText = (CLASS_TREE_MAP[c1]?.name || c1).split(' ')[0];
  if (c2NameEl) {
    const tree = CLASS_TREE_MAP[c1];
    const sc = tree?.secondClasses.find(s => s.id === c2);
    c2NameEl.innerText = (sc?.name || c2).split(' ')[0];
  }

  currentSkillBuilderTab = 'novice';
  renderSkillBuilderUI();

  const modal = document.getElementById("skill-builder-modal");
  if (modal) modal.style.display = 'flex';
}

// 4. Render Skill Builder UI
function renderSkillBuilderUI() {
  if (!activeEditingPlan || !activeEditingPlan.skillBuild) return;

  const queue = activeEditingPlan.skillBuild.skillPointQueue || [];
  const planned = activeEditingPlan.skillBuild.plannedLevels || {};
  const c1 = activeEditingPlan.class1Target || 'archer';
  const c2 = activeEditingPlan.class2Target || 'hunter';

  // Calculate points spent per tier
  const noviceSkills = SKILLS_DATABASE.novice || [];
  const class1Skills = SKILLS_DATABASE[c1] || [];
  const class2Skills = SKILLS_DATABASE[c2] || [];

  const noviceSpent = queue.filter(id => noviceSkills.some(s => s.id === id)).length;
  const class1Spent = queue.filter(id => class1Skills.some(s => s.id === id)).length;
  const class2Spent = queue.filter(id => class2Skills.some(s => s.id === id)).length;

  // Update budget badges
  const bNov = document.getElementById("skill-budget-novice");
  const bC1 = document.getElementById("skill-budget-class1");
  const bC2 = document.getElementById("skill-budget-class2");

  if (bNov) {
    bNov.innerText = `${noviceSpent} / 9 แต้ม`;
    bNov.style.color = noviceSpent >= 9 ? '#4ade80' : '#38bdf8';
  }
  if (bC1) {
    bC1.innerText = `${class1Spent} / 49 แต้ม`;
    bC1.style.color = class1Spent >= 49 ? '#4ade80' : '#c084fc';
  }
  if (bC2) {
    bC2.innerText = `${class2Spent} / 49 แต้ม`;
    bC2.style.color = class2Spent >= 49 ? '#4ade80' : '#facc15';
  }

  // Update Tabs Active State
  document.querySelectorAll('.skill-tab-btn').forEach(btn => {
    const tab = btn.getAttribute('data-tab');
    if (tab === currentSkillBuilderTab) {
      btn.className = 'btn btn-primary btn-sm skill-tab-btn';
    } else {
      btn.className = 'btn btn-secondary btn-sm skill-tab-btn';
    }
  });

  // Get active skills list
  let activeList = [];
  let tierMaxBudget = 49;
  let tierSpent = 0;
  if (currentSkillBuilderTab === 'novice') {
    activeList = noviceSkills;
    tierMaxBudget = 9;
    tierSpent = noviceSpent;
  } else if (currentSkillBuilderTab === 'class1') {
    activeList = class1Skills;
    tierMaxBudget = 49;
    tierSpent = class1Spent;
  } else {
    activeList = class2Skills;
    tierMaxBudget = 49;
    tierSpent = class2Spent;
  }

  const grid = document.getElementById("skill-cards-grid");
  if (grid) {
    grid.innerHTML = activeList.map(skill => {
      const curLv = planned[skill.id] || 0;
      const isMaxed = curLv >= skill.maxLevel;
      const canAdd = !isMaxed && (tierSpent < tierMaxBudget);
      const canMinus = curLv > 0;

      // Find all step indexes in queue where this skill was picked
      const stepIndexes = [];
      queue.forEach((sId, idx) => {
        if (sId === skill.id) stepIndexes.push(idx + 1);
      });

      const iconUrl = `https://www.aetheria-online.in.th/art/icons/skills/${skill.id}.webp`;

      return `
        <div class="skill-builder-card ${curLv > 0 ? 'is-allocated' : ''} ${isMaxed ? 'is-maxed' : ''}">
          <div class="skill-card-top">
            <img src="${iconUrl}" class="skill-card-icon" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'38\\' height=\\'38\\'><rect width=\\'100%\\' height=\\'100%\\' fill=\\'%231e293b\\'/><text x=\\'50%\\' y=\\'55%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' fill=\\'%23a855f7\\' font-size=\\'18\\'>⚡</text></svg>';">
            <div class="skill-card-info">
              <div class="skill-card-title">${escapeHTML(skill.name)}</div>
              <div class="skill-card-subtitle">
                <span>${escapeHTML(skill.thai)}</span>
                <span class="badge" style="background: ${skill.kind === 'passive' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(234, 179, 8, 0.15)'}; color: ${skill.kind === 'passive' ? '#38bdf8' : '#fbbf24'}; font-size: 9px; padding: 0 4px;">
                  ${skill.kind === 'passive' ? 'Passive' : 'Active'}
                </span>
              </div>
            </div>
          </div>

          ${skill.req ? `
            <div style="font-size: 10px; color: #f59e0b; margin-top: -4px;">↳ เงื่อนไข: ${escapeHTML(skill.req)}</div>
          ` : ''}

          <div class="skill-card-controls">
            <div class="skill-level-indicator ${isMaxed ? 'maxed' : ''}">
              Lv. ${curLv} / ${skill.maxLevel}
            </div>
            <div class="skill-btn-group">
              <button type="button" class="btn-skill-adjust" onclick="removeSkillPoint('${skill.id}')" ${!canMinus ? 'disabled' : ''}>-</button>
              <button type="button" class="btn-skill-adjust btn-plus" onclick="addSkillPoint('${skill.id}')" ${!canAdd ? 'disabled' : ''}>+</button>
            </div>
          </div>

          ${stepIndexes.length > 0 ? `
            <div style="display: flex; gap: 3px; flex-wrap: wrap; margin-top: 2px;">
              ${stepIndexes.map(st => `<span class="badge" style="background: rgba(168, 85, 247, 0.25); color: #d8b4fe; font-size: 9px; padding: 0 4px;">#${st}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // Render Queue Chips
  const qContainer = document.getElementById("skill-queue-chips-container");
  const qTotal = document.getElementById("skill-queue-total-count");
  if (qTotal) qTotal.innerText = queue.length;

  if (qContainer) {
    if (queue.length === 0) {
      qContainer.innerHTML = '<span style="font-size: 11px; color: #64748b; font-style: italic;">ยังไม่มีแต้มสกิลในคิว — คลิกปุ่ม + ที่สกิลด้านบนเพื่อเริ่มบันทึกลำดับ</span>';
    } else {
      qContainer.innerHTML = queue.map((sId, idx) => {
        let skillMeta = null;
        for (const k in SKILLS_DATABASE) {
          const found = SKILLS_DATABASE[k].find(s => s.id === sId);
          if (found) { skillMeta = found; break; }
        }
        const sName = skillMeta ? (skillMeta.thai || skillMeta.name) : sId;
        return `
          <span class="skill-queue-chip" title="ลำดับที่ ${idx + 1}: ${sName}">
            <span class="chip-step">#${idx + 1}</span>
            <span class="chip-name">${escapeHTML(sName)}</span>
            <span class="chip-del" onclick="removeSkillPointAtIndex(${idx})">&times;</span>
          </span>
        `;
      }).join('');
    }
  }
}

// 5. Add / Remove Skill Points
function addSkillPoint(skillId) {
  if (!activeEditingPlan || !activeEditingPlan.skillBuild) return;
  const queue = activeEditingPlan.skillBuild.skillPointQueue;
  const planned = activeEditingPlan.skillBuild.plannedLevels;

  let skillMeta = null;
  let skillTier = 'novice';
  for (const t in SKILLS_DATABASE) {
    const f = SKILLS_DATABASE[t].find(s => s.id === skillId);
    if (f) { skillMeta = f; skillTier = t; break; }
  }
  if (!skillMeta) return;

  const curLv = planned[skillId] || 0;
  if (curLv >= skillMeta.maxLevel) return;

  const tierBudget = (skillTier === 'novice') ? 9 : 49;
  const tierSkills = SKILLS_DATABASE[skillTier] || [];
  const tierSpent = queue.filter(id => tierSkills.some(s => s.id === id)).length;
  if (tierSpent >= tierBudget) {
    alert(`แต้มสกิลของสายนี้เต็มแล้ว (${tierBudget}/${tierBudget} แต้ม)!`);
    return;
  }

  queue.push(skillId);
  planned[skillId] = curLv + 1;
  renderSkillBuilderUI();
}

function removeSkillPoint(skillId) {
  if (!activeEditingPlan || !activeEditingPlan.skillBuild) return;
  const queue = activeEditingPlan.skillBuild.skillPointQueue;
  const planned = activeEditingPlan.skillBuild.plannedLevels;

  // Find last index
  let lastIdx = -1;
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i] === skillId) { lastIdx = i; break; }
  }
  if (lastIdx === -1) return;

  queue.splice(lastIdx, 1);
  planned[skillId] = Math.max(0, (planned[skillId] || 1) - 1);
  if (planned[skillId] === 0) delete planned[skillId];

  renderSkillBuilderUI();
}

function removeSkillPointAtIndex(idx) {
  if (!activeEditingPlan || !activeEditingPlan.skillBuild) return;
  const queue = activeEditingPlan.skillBuild.skillPointQueue;
  const planned = activeEditingPlan.skillBuild.plannedLevels;

  if (idx < 0 || idx >= queue.length) return;
  const sId = queue[idx];
  queue.splice(idx, 1);
  planned[sId] = Math.max(0, (planned[sId] || 1) - 1);
  if (planned[sId] === 0) delete planned[sId];

  renderSkillBuilderUI();
}

function resetSkillQueue() {
  if (!activeEditingPlan || !activeEditingPlan.skillBuild) return;
  if (activeEditingPlan.skillBuild.skillPointQueue.length === 0) return;
  if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างลำดับแต้มสกิลทั้งหมด?')) return;

  activeEditingPlan.skillBuild.skillPointQueue = [];
  activeEditingPlan.skillBuild.plannedLevels = {};
  renderSkillBuilderUI();
}

function applySkillPreset() {
  if (!activeEditingPlan || !activeEditingPlan.skillBuild) return;
  const c1 = activeEditingPlan.class1Target || 'archer';
  const c2 = activeEditingPlan.class2Target || 'hunter';

  activeEditingPlan.skillBuild.skillPointQueue = [];
  activeEditingPlan.skillBuild.plannedLevels = {};

  // 1. Novice: 9x basic-skill
  for (let i = 0; i < 9; i++) {
    addSkillPoint('basic-skill');
  }

  // 2. Class 1 Archer preset
  if (c1 === 'archer') {
    for (let i = 0; i < 10; i++) addSkillPoint('owl-eye');
    for (let i = 0; i < 10; i++) addSkillPoint('vulture-eye');
    for (let i = 0; i < 10; i++) addSkillPoint('double-strafe');
    for (let i = 0; i < 10; i++) addSkillPoint('improve-concentration');
    for (let i = 0; i < 9; i++) addSkillPoint('arrow-shower');
  }

  // 3. Class 2 Hunter preset
  if (c2 === 'hunter') {
    addSkillPoint('falconry-mastery');
    for (let i = 0; i < 10; i++) addSkillPoint('blitz-beat');
    for (let i = 0; i < 10; i++) addSkillPoint('steel-crow');
    for (let i = 0; i < 5; i++) addSkillPoint('auto-blitz-beat');
    for (let i = 0; i < 10; i++) addSkillPoint('land-mine');
    for (let i = 0; i < 10; i++) addSkillPoint('ankle-snare');
    for (let i = 0; i < 3; i++) addSkillPoint('claymore-trap');
  }

  renderSkillBuilderUI();
}

function saveSkillBuild() {
  const modal = document.getElementById("skill-builder-modal");
  if (modal) modal.style.display = 'none';
  updatePlanEditorBadges();
}

// 6. Open Stat Builder Modal
function openStatBuilderModal() {
  if (!activeEditingPlan) return;
  if (!activeEditingPlan.statBuild) {
    activeEditingPlan.statBuild = {
      targets: { STR: 1, AGI: 50, VIT: 1, INT: 1, DEX: 99, LUK: 30 },
      priorityOrder: ['DEX', 'AGI', 'LUK', 'VIT', 'INT', 'STR']
    };
  }

  const targets = activeEditingPlan.statBuild.targets || {};
  ['str', 'agi', 'vit', 'int', 'dex', 'luk'].forEach(st => {
    const key = st.toUpperCase();
    const val = targets[key] !== undefined ? targets[key] : (key === 'DEX' ? 99 : (key === 'AGI' ? 50 : 1));
    const numInput = document.getElementById(`stat-target-${st}`);
    const slider = document.getElementById(`stat-slider-${st}`);
    if (numInput) numInput.value = val;
    if (slider) slider.value = val;
  });

  const pSel = document.getElementById("stat-priority-order-select");
  if (pSel && activeEditingPlan.statBuild.priorityOrder) {
    const pStr = activeEditingPlan.statBuild.priorityOrder.join(',');
    pSel.value = pStr;
  }

  const modal = document.getElementById("stat-builder-modal");
  if (modal) modal.style.display = 'flex';
}

function applyStatPreset(presetKey) {
  const presets = {
    agi_dex: { targets: { STR: 1, AGI: 99, VIT: 1, INT: 1, DEX: 99, LUK: 9 }, priority: 'DEX,AGI,LUK,VIT,INT,STR' },
    blitz_beat: { targets: { STR: 1, AGI: 80, VIT: 1, INT: 20, DEX: 80, LUK: 60 }, priority: 'DEX,AGI,LUK,VIT,INT,STR' },
    str_agi: { targets: { STR: 90, AGI: 90, VIT: 30, INT: 1, DEX: 30, LUK: 1 }, priority: 'STR,AGI,VIT,DEX,LUK,INT' },
    int_dex: { targets: { STR: 1, AGI: 1, VIT: 30, INT: 99, DEX: 99, LUK: 1 }, priority: 'INT,DEX,VIT,AGI,LUK,STR' },
    vit_tank: { targets: { STR: 30, AGI: 1, VIT: 99, INT: 60, DEX: 50, LUK: 1 }, priority: 'VIT,INT,DEX,AGI,STR,LUK' }
  };

  const p = presets[presetKey];
  if (!p) return;

  ['str', 'agi', 'vit', 'int', 'dex', 'luk'].forEach(st => {
    const key = st.toUpperCase();
    const val = p.targets[key] || 1;
    const numInput = document.getElementById(`stat-target-${st}`);
    const slider = document.getElementById(`stat-slider-${st}`);
    if (numInput) numInput.value = val;
    if (slider) slider.value = val;
  });

  const pSel = document.getElementById("stat-priority-order-select");
  if (pSel && p.priority) pSel.value = p.priority;
}

function saveStatBuild() {
  if (!activeEditingPlan) return;
  const targets = {};
  ['str', 'agi', 'vit', 'int', 'dex', 'luk'].forEach(st => {
    const key = st.toUpperCase();
    const numInput = document.getElementById(`stat-target-${st}`);
    targets[key] = numInput ? parseInt(numInput.value, 10) || 1 : 1;
  });

  const pSel = document.getElementById("stat-priority-order-select");
  const priorityOrder = pSel ? pSel.value.split(',') : ['DEX', 'AGI', 'LUK', 'VIT', 'INT', 'STR'];

  activeEditingPlan.statBuild = { targets, priorityOrder };
  updatePlanEditorBadges();

  const modal = document.getElementById("stat-builder-modal");
  if (modal) modal.style.display = 'none';
}

// 7. Setup Event Listeners for Plan Builder Modals
function setupPlanBuilderEventListeners() {
  // Stat sliders sync
  ['str', 'agi', 'vit', 'int', 'dex', 'luk'].forEach(st => {
    const numInput = document.getElementById(`stat-target-${st}`);
    const slider = document.getElementById(`stat-slider-${st}`);
    if (numInput && slider) {
      numInput.oninput = () => { slider.value = numInput.value; };
      slider.oninput = () => { numInput.value = slider.value; };
    }
  });

  // Buttons in Plan Editor Header
  const btnOpenSkill = document.getElementById("btn-open-skill-builder");
  if (btnOpenSkill) btnOpenSkill.onclick = openSkillBuilderModal;

  const btnOpenStat = document.getElementById("btn-open-stat-builder");
  if (btnOpenStat) btnOpenStat.onclick = openStatBuilderModal;

  // Skill Builder Tab Buttons
  document.querySelectorAll('.skill-tab-btn').forEach(btn => {
    btn.onclick = () => {
      currentSkillBuilderTab = btn.getAttribute('data-tab');
      renderSkillBuilderUI();
    };
  });

  // Skill Builder Controls
  const btnSkillClose = document.getElementById("skill-builder-close-btn");
  if (btnSkillClose) btnSkillClose.onclick = () => { document.getElementById("skill-builder-modal").style.display = 'none'; };
  const btnSkillCancel = document.getElementById("skill-builder-cancel-btn");
  if (btnSkillCancel) btnSkillCancel.onclick = () => { document.getElementById("skill-builder-modal").style.display = 'none'; };
  const btnSkillSave = document.getElementById("skill-builder-save-btn");
  if (btnSkillSave) btnSkillSave.onclick = saveSkillBuild;
  const btnSkillReset = document.getElementById("btn-skill-reset");
  if (btnSkillReset) btnSkillReset.onclick = resetSkillQueue;
  const btnSkillPreset = document.getElementById("btn-skill-apply-preset");
  if (btnSkillPreset) btnSkillPreset.onclick = applySkillPreset;

  // Stat Builder Controls
  const btnStatClose = document.getElementById("stat-builder-close-btn");
  if (btnStatClose) btnStatClose.onclick = () => { document.getElementById("stat-builder-modal").style.display = 'none'; };
  const btnStatCancel = document.getElementById("stat-builder-cancel-btn");
  if (btnStatCancel) btnStatCancel.onclick = () => { document.getElementById("stat-builder-modal").style.display = 'none'; };
  const btnStatSave = document.getElementById("stat-builder-save-btn");
  if (btnStatSave) btnStatSave.onclick = saveStatBuild;

  // Stat Presets
  const pAgiDex = document.getElementById("preset-stat-agi-dex");
  if (pAgiDex) pAgiDex.onclick = () => applyStatPreset('agi_dex');
  const pBlitz = document.getElementById("preset-stat-blitz");
  if (pBlitz) pBlitz.onclick = () => applyStatPreset('blitz_beat');
  const pStrAgi = document.getElementById("preset-stat-str-agi");
  if (pStrAgi) pStrAgi.onclick = () => applyStatPreset('str_agi');
  const pIntDex = document.getElementById("preset-stat-int-dex");
  if (pIntDex) pIntDex.onclick = () => applyStatPreset('int_dex');
  const pVit = document.getElementById("preset-stat-vit-tank");
  if (pVit) pVit.onclick = () => applyStatPreset('vit_tank');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupPlanBuilderEventListeners);
} else {
  setupPlanBuilderEventListeners();
}
