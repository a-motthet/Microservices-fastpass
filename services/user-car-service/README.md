# 🅿️ Parking Reservation System - User-Car Service

# 🚗 User-Car Service (Reservation & Check-in)

Service นี้เป็นหัวใจหลักของระบบจอดรถ ทำหน้าที่รับผิดชอบการจัดการ **การจอง (Reservations)**, **การเช็กอิน (Check-ins)**, และการอัปเดตสถานะต่างๆ ที่เกี่ยวข้องกับรถยนต์และการจอง

---

## 📋 สรุปโปรเจกต์ (Project Overview)

โปรเจกต์ **Parking Reservation System** เป็นระบบจองที่จอดรถที่ออกแบบด้วยสถาปัตยกรรม **Microservices** โดยใช้หลักการออกแบบที่ทันสมัย:

- **Hexagonal Architecture (Ports and Adapters):** แยก Business Logic ออกจากส่วน Technical Concern
- **CQRS (Command Query Responsibility Segregation):** แยกส่วนเขียน (Command) และอ่าน (Query)
- **Event Sourcing:** เก็บทุกการเปลี่ยนแปลงในรูปแบบ Event
- **Domain-Driven Design (DDD):** แบ่งแยก Domain ตามความรับผิดชอบ

### 🏗️ สถาปัตยกรรมระบบ (System Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Application                      │
│                  (Angular/React/Vue)                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (Port 4000)                   │
│  • GraphQL (Query) - Apollo Server                           │
│  • REST (Command) - Express Router                           │
│  • Single Entry Point สำหรับ Frontend                        │
└──────┬──────────────┬──────────────┬──────────────┬─────────┘
       │              │              │              │
       ▼              ▼              ▼              ▼
┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐
│  User    │  │ User-Car     │  │  Slot    │  │  Recently    │
│ Service  │  │ Service      │  │ Service  │  │ Service      │
│ (3001)   │  │ (3003)        │  │ (3006)  │  │ (3005)       │
└────┬─────┘  └──────┬───────┘  └────┬─────┘  └──────┬───────┘
     │               │               │               │
     └───────────────┴───────────────┴───────────────┘
                     │
                     ▼
            ┌─────────────────┐
            │   RabbitMQ       │
            │  (Event Broker)  │
            │ events_exchange  │
            └────────┬──────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │   Supabase/PostgreSQL  │
        │  • event_store         │
        │  • snapshots           │
        │  • Read Models         │
        └────────────────────────┘
```

### 🔧 Components และหน้าที่ (Components & Responsibilities)

#### 1. **API Gateway** (`api-gateway/`)

**หน้าที่:**

- เป็น Single Entry Point สำหรับ Frontend
- **GraphQL** สำหรับ Query (อ่านข้อมูล)
- **REST API** สำหรับ Command (เขียนข้อมูล)
- Route requests ไปยัง Microservices ที่เหมาะสม
- Port: `4000`

**เทคโนโลยี:**

- Express.js
- Apollo Server (GraphQL)
- Axios (HTTP Client)

---

#### 2. **User Service** (`services/user-service/`)

**หน้าที่:**

- จัดการข้อมูลผู้ใช้ (User Management)
- สร้างผู้ใช้ใหม่
- อัปเดตข้อมูลผู้ใช้
- Query ข้อมูลผู้ใช้

**Domain:**

- Aggregate: `UserAggregate`
- Commands: `CreateUserCommand`
- Events: `UserCreatedEvent`
- Read Model: `users` table

**Port:** `3001`

---

#### 3. **User-Car Service** (`services/user-car-service/`) ⭐ **Service นี้**

**หน้าที่:**

- จัดการการจองที่จอดรถ (Reservation Management)
- จัดการการเช็กอิน/เช็กเอาท์ (Check-in/Check-out)
- อัปเดตสถานะการจอง
- คำนวณความว่างของช่องเวลา (Time Slots Availability)
- จัดการข้อมูลรถยนต์ของผู้ใช้

**Domain:**

- Aggregate: `ReservationAggregate`
- Commands:
  - `CreateReservationCommand`
  - `UpdateParkingStatusCommand`
  - `CheckInByLicensePlateCommand`
- Events:
  - `ReservationCreatedEvent`
  - `ParkingStatusUpdatedEvent`
- Read Models: `reservations`, `cars` tables

**Port:** `3003`

**API Endpoints:**

- `GET /reservations/availability` - ดูความว่างของช่องเวลา
- `GET /reservations/:id` - ดูข้อมูลการจอง
- `POST /reservations` - สร้างการจองใหม่
- `POST /reservations/:id/status` - อัปเดตสถานะการจอง
- `POST /check-ins` - เช็กอินด้วยป้ายทะเบียน

---

#### 4. **Slot Service** (`services/slot-service/`)

**หน้าที่:**

- จัดการช่องจอดรถ (Parking Slots)
- สร้างช่องจอดรถใหม่
- Query ข้อมูลช่องจอดรถ
- จัดการความจุ (Capacity) ของแต่ละสถานที่จอดรถ

**Domain:**

- Aggregate: `SlotAggregate`
- Commands: `CreateSlotCommand`
- Events: `SlotCreatedEvent`
- Read Model: `slots` table

**Port:** `3006`

---

#### 5. **Recently Service** (`services/recently-service/`)

**หน้าที่:**

- จัดการกิจกรรมล่าสุด (Recent Activities)
- ติดตามการเปลี่ยนแปลงต่างๆ ในระบบ
- แสดงประวัติการใช้งานของผู้ใช้

**Domain:**

- Projections: `ActivityProjection`
- Read Model: `recent_activities` table

**Port:** `3005`

---

### 🗄️ Infrastructure Components

#### **RabbitMQ** (Message Broker)

**หน้าที่:**

- สื่อสาร Events ระหว่าง Services แบบ Asynchronous
- ใช้ Exchange Pattern (`events_exchange`) แบบ `fanout`
- แต่ละ Service จะสร้าง Queue ของตัวเองและ bind กับ Exchange
- รองรับ Event-Driven Architecture

**Configuration:**

- Exchange Name: `events_exchange`
- Type: `fanout` (broadcast to all queues)
- Port: `5672` (default)

---

#### **Supabase/PostgreSQL** (Database)

**หน้าที่:**

- เก็บ Event Store (Write Side)
- เก็บ Snapshots (Performance Optimization)
- เก็บ Read Models (Query Side)
- ใช้ Stored Functions สำหรับ Concurrency Control

**Tables:**

- `event_store` - เก็บ Events ทั้งหมด
- `snapshots` - เก็บสถานะของ Aggregate เป็นระยะๆ
- `latest_versions` - เก็บเวอร์ชันล่าสุดของ Aggregate
- `users` - Read Model สำหรับ User
- `reservations` - Read Model สำหรับ Reservation
- `slots` - Read Model สำหรับ Slot
- `recent_activities` - Read Model สำหรับ Recent Activities

---

### 📦 Shared Library (`packages/common/`)

**หน้าที่:**

- เก็บ Infrastructure Code ที่ใช้ร่วมกันระหว่าง Services
- ลดการซ้ำซ้อนของโค้ด (Code Duplication)

**Components:**

- `RabbitMQAdapter` - Adapter สำหรับ RabbitMQ
- `SupabaseEventStore` - Event Store สำหรับ Supabase

**ประโยชน์:**

- แก้ไข bug หรือเพิ่มฟีเจอร์ที่เดียว ใช้ได้ทุก Service
- รักษา Consistency ระหว่าง Services
- ลดขนาดโค้ดโดยรวม

---

### 🔄 การทำงานร่วมกันของ Services (Service Interaction)

#### **Flow: สร้างการจอง (Create Reservation)**

```
1. Frontend → API Gateway (POST /reservations)
2. API Gateway → User-Car Service
3. User-Car Service:
   - สร้าง Command: CreateReservationCommand
   - Handler ประมวลผลผ่าน ReservationAggregate
   - สร้าง Event: ReservationCreatedEvent
   - บันทึก Event ลง event_store
   - Publish Event ไปยัง RabbitMQ
4. RabbitMQ แจกจ่าย Event ไปยัง:
   - Recently Service → สร้าง Recent Activity
   - (Services อื่นๆ ที่ subscribe)
5. EventConsumer ใน User-Car Service:
   - รับ Event จาก RabbitMQ
   - Projection อัปเดต Read Model (reservations table)
6. Response กลับไปยัง Frontend
```

#### **Flow: เช็กอิน (Check-in)**

```
1. Frontend → API Gateway (POST /check-ins)
2. API Gateway → User-Car Service
3. User-Car Service:
   - ค้นหาการจองที่ pending จาก license_plate
   - สร้าง Command: UpdateParkingStatusCommand
   - Handler อัปเดตสถานะเป็น checked_in
   - สร้าง Event: ParkingStatusUpdatedEvent
   - บันทึก Event และ Publish ไปยัง RabbitMQ
4. EventConsumer อัปเดต Read Model
5. Response กลับไปยัง Frontend
```

---

### 🎯 สรุปความรับผิดชอบของแต่ละ Service

| Service              | หน้าที่หลัก                 | Domain      | Port |
| -------------------- | --------------------------- | ----------- | ---- |
| **API Gateway**      | Single Entry Point, Routing | -           | 4000 |
| **User Service**     | จัดการผู้ใช้                | User        | 3001 |
| **User-Car Service** | จัดการการจองและเช็กอิน      | Reservation | 3003 |
| **Slot Service**     | จัดการช่องจอดรถ             | Slot        | 3006 |
| **Recently Service** | จัดการกิจกรรมล่าสุด         | Activity    | 3005 |

---

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
