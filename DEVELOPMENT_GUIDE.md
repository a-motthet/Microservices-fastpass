# คู่มือการพัฒนา Service (CQRS & Event Sourcing)

เอกสารนี้สรุปขั้นตอนและแนวปฏิบัติสำหรับการพัฒนาฟีเจอร์ใหม่ๆ ใน Service นี้

---

## 🏛️ หลักการพื้นฐาน

ระบบของเราใช้สถาปัตยกรรม CQRS และ Event Sourcing

- **CQRS (Command Query Responsibility Segregation):** เราแยกส่วนที่ใช้ "สั่งการ/เปลี่ยนแปลงข้อมูล" (Command) ออกจากส่วนที่ใช้ "สอบถาม/อ่านข้อมูล" (Query)
- **Event Sourcing:** เราไม่เก็บสถานะล่าสุด แต่จะเก็บ "เหตุการณ์ (Event)" ทั้งหมดที่เคยเกิดขึ้นในตาราง `event_store` สถานะปัจจุบันจะถูกสร้างขึ้นมาใหม่จากการเล่นเหตุการณ์ย้อนหลัง

---

## 🚀 Workflow: การเพิ่มฟีเจอร์ใหม่

ให้ทำตามลำดับ "Inside-Out" (จาก Domain ออกไป Infrastructure) เสมอ
**ตัวอย่าง: เพิ่มฟีเจอร์ "ยกเลิกการจอง (Cancel Reservation)"**

#### ขั้นตอนที่ 1: ชั้น Domain (กำหนด "อะไร" ที่จะทำ)

1.  **สร้าง Command:** สร้างไฟล์ `src/domain/commands/CancelReservationCommand.js` โดยรับ `reservationId` และ `reason`
2.  **สร้าง Event:** สร้างไฟล์ `src/domain/events/ReservationCancelledEvent.js` โดยเก็บ `reservationId`, `reason`, และ `cancelledAt`
3.  **แก้ไข Aggregate:** เปิด `src/domain/aggregates/ReservationAggregate.js`
    - เพิ่มฟังก์ชัน `cancelReservation(command)`
    - ใส่ Logic ตรวจสอบ เช่น `if (this.status !== 'checked_in') { throw new Error(...) }`
    - ถ้าถูกต้อง ให้สร้าง `ReservationCancelledEvent` ขึ้นมา

#### ขั้นตอนที่ 2: ชั้น Application (กำหนด "วิธี" การจัดการ)

1.  **สร้าง Command Handler:** สร้างไฟล์ `src/application/handlers/command-handlers/CancelReservationCommandHandler.js`
    - `constructor` รับ `eventStore` และ `messageBroker`
    - เมธอด `handle(command)` จะทำหน้าที่:
      1.  โหลด `ReservationAggregate` จาก `eventStore`
      2.  เรียก `aggregate.cancelReservation(command)`
      3.  บันทึก Event ใหม่ลง `eventStore`
      4.  ส่ง Event ไปยัง `messageBroker.publishEvent(event)`

#### ขั้นตอนที่ 3: ชั้น Infrastructure (เปิด "ช่องทาง" ให้ข้างนอกเรียกใช้)

1.  **สร้าง API Endpoint:** แก้ไขไฟล์ `src/index.js`
    - เพิ่ม Route ใหม่ เช่น `POST /reservations/:id/cancel`
    - Route นี้จะรับ Request, สร้าง `CancelReservationCommand`, และส่งไปให้ `CancelReservationCommandHandler` จัดการ

#### ขั้นตอนที่ 4: ชั้น Projections (อัปเดต "ฝั่งอ่านข้อมูล")

1.  **แก้ไข EventConsumer:** เปิด `src/projections/EventConsumer.js`
    - ใน `switch (event_type)` ให้เพิ่ม `case 'ReservationCancelledEvent':`
    - สั่งให้ `reservationProjection` ทำงาน
2.  **แก้ไข Projection:** เปิด `src/projections/ReservationProjection.js`
    - สร้างเมธอด `handleReservationCancelled(event)`
    - ข้างในเมธอด ให้ใช้ `this.supabase` เพื่อ `UPDATE` สถานะในตาราง `reservation_read_model` เป็น `cancelled`

---

## 📂 โครงสร้างไฟล์ (อ้างอิง)

- `src/domain`: หัวใจของระบบ, Business Logic ล้วนๆ
- `src/application`: ตัวประสานงาน, จัดการ Use Case
- `src/infrastructure`: ส่วนเชื่อมต่อเทคโนโลยีภายนอก (API, Database, Messaging)
- `src/projections`: ส่วนจัดการ Read Model (การอัปเดตข้อมูลฝั่งอ่าน)

---

## ✨ Best Practices และการพัฒนาต่อ

- **Testing:**
  - ควรเขียน Unit Test สำหรับ Logic ใน `Aggregate` เพราะเป็นส่วนที่สำคัญและทดสอบง่ายที่สุด
  - เขียน Integration Test เพื่อทดสอบ Flow ทั้งหมดตั้งแต่ยิง API จนถึงข้อมูลใน Read Model เปลี่ยนแปลง
- **Error Handling:** ทำให้การจัดการ Error ใน API Endpoint ดีขึ้น อาจจะสร้าง Middleware สำหรับจัดการ Error โดยเฉพาะ
- **Query Side:** หากต้องการหน้าแสดงผลที่ซับซ้อน ให้สร้าง `QueryHandler` และ Read Model ใหม่ที่เหมาะกับหน้านั้นๆ โดยเฉพาะ
- **Snapshots:** หาก Aggregate หนึ่งมีแนวโน้มที่จะมี Event เกิดขึ้นเยอะมากๆ (เช่น > 100 events) ให้พิจารณาการทำ Snapshot เพื่อเพิ่มความเร็วในการโหลด Aggregate
- **Environment Variables:** ห้ามเก็บข้อมูลสำคัญ (เช่น API Keys) ไว้ในโค้ดเด็ดขาด ให้ใช้ไฟล์ `.env` เสมอ และอย่า commit ไฟล์ `.env` ขึ้น Git
