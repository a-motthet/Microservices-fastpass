# Microservices-fastpass

# 🚗 User-Car Service (Reservation & Check-in)

Service นี้เป็นหัวใจหลักของระบบจอดรถ ทำหน้าที่รับผิดชอบการจัดการ **การจอง (Reservations)**, **การเช็กอิน (Check-ins)**, และการอัปเดตสถานะต่างๆ ที่เกี่ยวข้องกับรถยนต์และการจอง

---

## 🏛️ สถาปัตยกรรม (Architecture)

Service นี้สร้างขึ้นโดยใช้สถาปัตยกรรม **CQRS (Command Query Responsibility Segregation)** และ **Event Sourcing (ES)** อย่างเต็มรูปแบบ

### 1. ฝั่งเขียน (Write Side - Commands)

- **Logic:** การเปลี่ยนแปลงสถานะทั้งหมด (เช่น สร้างการจอง, อัปเดตสถานะ) จะถูกประมวลผลเป็น **Commands** (คำสั่ง)
- **Storage:** คำสั่งจะถูกตรวจสอบโดย **Aggregate** (เช่น `ReservationAggregate`) หากถูกต้อง Aggregate จะสร้าง **Events** (เหตุการณ์)
- **Source of Truth:** Event เหล่านี้จะถูกบันทึกเรียงลำดับลงในตาราง `event_store` ซึ่งถือเป็น "ความจริง" เพียงหนึ่งเดียวของระบบ

### 2. ฝั่งอ่าน (Read Side - Queries)

- **Logic:** **`EventConsumer`** (ซึ่งเชื่อมต่อกับ RabbitMQ) จะคอยดักฟัง Events ที่เกิดขึ้น
- **Storage:** เมื่อได้รับ Event (เช่น `ReservationCreatedEvent`), **Projection** (เช่น `ReservationProjection`) จะนำข้อมูลไปอัปเดตตาราง Read Model (เช่น `reservations`)
- **Usage:** API ฝั่ง `GET` ทั้งหมดจะอ่านข้อมูลจากตาราง Read Model (`reservations`, `cars`) โดยตรง เพื่อความรวดเร็ว

### 3. การจัดการขั้นสูง (Advanced Features)

- **Concurrency Control (ป้องกันข้อมูลชนกัน):**
  ใช้ตาราง `latest_versions` ร่วมกับ Stored Function (`save_events_and_update_version`) ใน PostgreSQL เพื่อให้แน่ใจว่าการแก้ไขข้อมูลจะอ้างอิงจากเวอร์ชันล่าสุดเสมอ (Optimistic Concurrency Control)
- **Performance (Snapshots):**
  ใช้ตาราง `snapshots` เพื่อ "เซฟ" สถานะของ Aggregate เป็นระยะๆ (เช่น ทุก 2 events) เพื่อลดเวลาในการ "เล่นซ้ำ" Event ทั้งหมดตอนโหลดข้อมูล

---

## 🚀 การติดตั้งและรัน (Installation & Running)

### 1. สิ่งที่ต้องมี (Prerequisites)

- Node.js (v20.x+ แนะนำ)
- RabbitMQ Server (ต้องรันอยู่)
- Supabase (PostgreSQL) Database ที่มี Schema (ตาราง `event_store`, `snapshots`, `latest_versions`, `reservations`, `cars`) และ Stored Function (`save_events_and_update_version`)

### 2. การตั้งค่า

1.  **Clone Repository** (ถ้ายังไม่มี)
2.  **Install Dependencies:**
    ```bash
    cd services/user-car-service
    npm install
    ```
3.  **ตั้งค่า Environment Variables:**
    สร้างไฟล์ `.env` ในโฟลเดอร์ `user-car-service` และใส่ค่าที่จำเป็น

    ```env
    # Supabase (ต้องใช้ Service Role Key)
    SUPABASE_URL=[https://your-project.supabase.co](https://your-project.supabase.co)
    SUPABASE_KEY=your_supabase_service_role_key

    # RabbitMQ
    RABBITMQ_URL=amqp://localhost:5672

    # Port สำหรับ Service นี้
    PORT=3003

    # (Optional) URL ของ Service อื่นที่ต้องคุยด้วย
    # SLOT_SERVICE_URL=http://localhost:3006
    ```

### 3. การรัน Service

- **สำหรับ Development (พัฒนา):**
  (คำสั่งนี้จะใช้ `nodemon` และโหลด `.env` อัตโนมัติ)
  ```bash
  npm run dev
  ```
- **สำหรับ Production:**
  ```bash
  npm start
  ```

---

## 📦 API Endpoints (ผ่าน API Gateway)

Service นี้มี API หลักๆ ดังนี้ (ถูกเรียกผ่าน Gateway เช่น `http://localhost:4000`)

### Query API (ฝั่งอ่าน)

#### `GET /reservations/availability`

ดึงรายการ "ช่องเวลา" (Time Slots) 24 ชั่วโมงในวันที่ระบุ พร้อมสถานะว่าว่างหรือไม่ (`isAvailable`)

- **Query Params:** `?date=YYYY-MM-DD`
- **ตัวอย่าง:** `GET /reservations/availability?date=2025-11-17`
- **ผลลัพธ์ (Response):**
  ```json
  [
    {
      "slotId": "S-20251117-0000",
      "startTime": "2025-11-17T00:00:00.000Z",
      "endTime": "2025-11-17T01:00:00.000Z",
      "displayText": "00:00 - 01:00",
      "isAvailable": true
    },
    {
      "slotId": "S-20251117-0100",
      "startTime": "2025-11-17T01:00:00.000Z",
      "endTime": "2025-11-17T02:00:00.000Z",
      "displayText": "01:00 - 02:00",
      "isAvailable": false
    }
    // ... (อีก 22 รายการ)
  ]
  ```

#### `GET /reservations/:id`

ดึงข้อมูลสถานะปัจจุบันของการจอง 1 รายการ จาก Read Model

---

### Command API (ฝั่งเขียน)

#### `POST /reservations`

ยืนยันการจอง "ช่องเวลา" (Time Slot) ที่ผู้ใช้เลือก

- **Body (JSON):**
  ```json
  {
    "userId": "uuid-ของ-user",
    "slotId": "S-20251117-0900",
    "startTime": "2025-11-17T09:00:00Z",
    "endTime": "2025-11-17T10:00:00Z"
  }
  ```

#### `POST /reservations/:id/status`

อัปเดตสถานะของการจอง (เช่น `checked_out`, `cancelled`)

- **Body (JSON):**
  ```json
  {
    "status": "checked_out"
  }
  ```

#### `POST /check-ins`

ทำการเช็กอินโดยใช้ป้ายทะเบียนรถ ระบบจะค้นหาการจองที่ `pending` ของ User ที่เป็นเจ้าของรถ และอัปเดตสถานะเป็น `checked_in`

- **Body (JSON):**
  ```json
  {
    "license_plate": "กข-1234"
  }
  ```

---

## 📂 โครงสร้างไฟล์ (File Structure)

โครงสร้างของ Service นี้ถูกออกแบบตามหลัก CQRS/ES เพื่อแบ่งแยกความรับผิดชอบอย่างชัดเจน
user-car-service/
├── src/
│ ├── application/
│ │ └── handlers/
│ │ └── command-handlers/
│ │ ├── CreateReservationCommandHandler.js
│ │ ├── UpdateParkingStatusCommandHandler.js
│ │ └── CheckInByLicensePlateCommandHandler.js
│ ├── domain/
│ │ ├── aggregates/
│ │ │ └── ReservationAggregate.js
│ │ ├── commands/
│ │ │ ├── CreateReservationCommand.js
│ │ │ ├── UpdateParkingStatusCommand.js
│ │ │ └── CheckInByLicensePlateCommand.js
│ │ └── events/
│ │ ├── ReservationCreatedEvent.js
│ │ └── ParkingStatusUpdatedEvent.js
│ ├── infrastructure/
│ │ ├── messaging/
│ │ │ └── RabbitMQAdapter.js
│ │ └── persistence/
│ │ ├── SupabaseEventStore.js
│ │ └── SupabaseSnapshotStore.js
│ ├── projections/
│ │ ├── EventConsumer.js
│ │ └── ReservationProjection.js
│ └── index.js # 🚀 ไฟล์หลัก (มี API: POST /reservations, GET /reservations/availability)
├── .env
└── package.json

```

```
