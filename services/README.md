# 🅿️ Parking Reservation System - Services Overview

## 📋 สรุปโดยรวม (Overview)

โฟลเดอร์ `services/` ประกอบด้วย **4 Microservices** ที่ทำงานร่วมกันเพื่อสร้างระบบจองที่จอดรถแบบครบวงจร โดยแต่ละ Service มีความรับผิดชอบใน Domain ของตัวเองและสื่อสารกันผ่าน **RabbitMQ Event Broker**

---

## 🏗️ สถาปัตยกรรม (Architecture)

ทุก Service ในโปรเจกต์นี้ใช้สถาปัตยกรรมเดียวกัน:

- **CQRS (Command Query Responsibility Segregation)** - แยกส่วนเขียนและอ่าน
- **Event Sourcing** - เก็บทุกการเปลี่ยนแปลงเป็น Event
- **Hexagonal Architecture** - แยก Domain Logic จาก Infrastructure
- **Domain-Driven Design (DDD)** - แบ่งแยกตาม Domain

### การสื่อสารระหว่าง Services

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   User      │      │  User-Car   │      │    Slot     │      │  Recently   │
│  Service    │      │  Service    │      │  Service    │      │  Service    │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                    │                    │
       └────────────────────┴────────────────────┴────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │   RabbitMQ    │
                    │ events_exchange│
                    │   (fanout)    │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │   Supabase    │
                    │  PostgreSQL   │
                    └───────────────┘
```

---

## 🔧 Services รายละเอียด

### 1. 👤 User Service (`user-service/`)

**Port:** `3001`

**หน้าที่หลัก:**

- จัดการข้อมูลผู้ใช้ (User Management)
- สร้างผู้ใช้ใหม่
- Query ข้อมูลผู้ใช้
- อัปเดตข้อมูลผู้ใช้

**Domain Model:**

- **Aggregate:** `UserAggregate`
- **Commands:**
  - `CreateUserCommand` - สร้างผู้ใช้ใหม่
- **Events:**
  - `UserCreatedEvent` - Event เมื่อสร้างผู้ใช้สำเร็จ
- **Read Model:** `user_read_model` table

**API Endpoints:**

- `POST /users` - สร้างผู้ใช้ใหม่
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com"
  }
  ```
- `GET /users/:id` - ดึงข้อมูลผู้ใช้ตาม ID
- `GET /health` - Health check

**โครงสร้าง:**

```
user-service/
├── src/
│   ├── application/
│   │   └── handlers/
│   │       └── command-handlers/
│   │           └── CreateUserCommandHandler.js
│   ├── domain/
│   │   ├── aggregates/
│   │   │   └── UserAggregate.js
│   │   ├── commands/
│   │   │   └── CreateUserCommand.js
│   │   └── events/
│   │       └── UserCreatedEvent.js
│   ├── infrastructure/
│   │   ├── api/
│   │   ├── messaging/
│   │   │   └── RabbitMQAdapter.js
│   │   └── persistence/
│   │       ├── SupabaseEventStore.js
│   │       └── SupabaseSnapshotStore.js
│   └── projections/
│       ├── EventConsumer.js
│       └── UserProjection.js
└── index.js
```

**Event Flow:**

1. สร้าง User → `UserCreatedEvent` → Publish ไปยัง RabbitMQ
2. Services อื่นๆ (User-Car, Recently) รับ Event และอัปเดต Read Model ของตัวเอง

---

### 2. 🚗 User-Car Service (`user-car-service/`)

**Port:** `3003`

**หน้าที่หลัก:**

- จัดการการจองที่จอดรถ (Reservation Management)
- จัดการการเช็กอิน/เช็กเอาท์ (Check-in/Check-out)
- คำนวณความว่างของช่องเวลา (Time Slots Availability)
- จัดการข้อมูลรถยนต์ของผู้ใช้

**Domain Model:**

- **Aggregate:** `ReservationAggregate`
- **Commands:**
  - `CreateReservationCommand` - สร้างการจองใหม่
  - `UpdateParkingStatusCommand` - อัปเดตสถานะการจอง
  - `CheckInByLicensePlateCommand` - เช็กอินด้วยป้ายทะเบียน
- **Events:**
  - `ReservationCreatedEvent` - Event เมื่อสร้างการจองสำเร็จ
  - `ParkingStatusUpdatedEvent` - Event เมื่ออัปเดตสถานะ
- **Read Models:** `reservations`, `cars` tables

**API Endpoints:**

**Query (อ่าน):**

- `GET /reservations/availability?date=YYYY-MM-DD&parkingSiteId=xxx` - ดูความว่างของช่องเวลา 24 ชั่วโมง
- `GET /reservations/:id` - ดูข้อมูลการจอง

**Command (เขียน):**

- `POST /reservations` - สร้างการจองใหม่
  ```json
  {
    "userId": "uuid",
    "slotId": "S-20251117-0900",
    "startTime": "2025-11-17T09:00:00Z",
    "endTime": "2025-11-17T10:00:00Z",
    "parkingSiteId": "ps-01"
  }
  ```
- `POST /reservations/:id/status` - อัปเดตสถานะการจอง
  ```json
  {
    "status": "checked_out"
  }
  ```
- `POST /check-ins` - เช็กอินด้วยป้ายทะเบียน
  ```json
  {
    "license_plate": "กข-1234"
  }
  ```

**โครงสร้าง:**

```
user-car-service/
├── src/
│   ├── application/
│   │   └── handlers/
│   │       └── command-handlers/
│   │           ├── CreateReservationCommandHandler.js
│   │           ├── UpdateParkingStatusCommandHandler.js
│   │           └── CheckInByLicensePlateCommandHandler.js
│   ├── domain/
│   │   ├── aggregates/
│   │   │   └── ReservationAggregate.js
│   │   ├── commands/
│   │   │   ├── CreateReservationCommand.js
│   │   │   ├── UpdateParkingStatusCommand.js
│   │   │   └── CheckInByLicensePlateCommand.js
│   │   └── events/
│   │       ├── ReservationCreatedEvent.js
│   │       └── ParkingStatusUpdatedEvent.js
│   ├── infrastructure/
│   │   ├── messaging/
│   │   │   └── RabbitMQAdapter.js
│   │   └── persistence/
│   │       ├── SupabaseEventStore.js
│   │       └── SupabaseSnapshotStore.js
│   └── projections/
│       ├── EventConsumer.js
│       ├── ReservationProjection.js
│       ├── ReservationHistoryProjection.js
│       └── UserProjection.js
└── index.js
```

**Features:**

- **Snapshots:** ใช้ Snapshot Store เพื่อเพิ่มประสิทธิภาพ (snapshot ทุก 2 events)
- **Concurrency Control:** ใช้ Optimistic Concurrency Control ผ่าน `latest_versions` table
- **Time Slot Calculation:** คำนวณความว่างของช่องเวลาโดยเรียก `slot-service` เพื่อดึง capacity

**Event Flow:**

1. สร้าง Reservation → `ReservationCreatedEvent` → RabbitMQ
2. อัปเดต Status → `ParkingStatusUpdatedEvent` → RabbitMQ
3. Recently Service รับ Events และสร้าง Recent Activity

---

### 3. 🅿️ Slot Service (`slot-service/`)

**Port:** `3006`

**หน้าที่หลัก:**

- จัดการช่องจอดรถ (Parking Slots)
- สร้างช่องจอดรถใหม่
- Query ข้อมูลช่องจอดรถ
- จัดการความจุ (Capacity) ของแต่ละสถานที่จอดรถ

**Domain Model:**

- **Aggregate:** `SlotAggregate`
- **Commands:**
  - `CreateSlotCommand` - สร้างช่องจอดรถใหม่
- **Events:**
  - `SlotCreatedEvent` - Event เมื่อสร้างช่องจอดรถสำเร็จ
- **Read Model:** `slots` table

**API Endpoints:**

- `GET /slots?parkingSiteId=xxx&status=active` - ดึงข้อมูลช่องจอดรถ (รองรับการกรอง)
- `POST /slots` - สร้างช่องจอดรถใหม่ (Admin)
  ```json
  {
    "name": "A-01",
    "floor": 1,
    "parkingSiteId": "ps-01",
    "details": "Near entrance"
  }
  ```
- `GET /health` - Health check

**โครงสร้าง:**

```
slot-service/
├── src/
│   ├── application/
│   │   └── handlers/
│   │       └── command-handlers/
│   │           └── CreateSlotCommandHandler.js
│   ├── domain/
│   │   ├── aggregates/
│   │   │   └── SlotAggregate.js
│   │   ├── commands/
│   │   │   └── CreateSlotCommand.js
│   │   └── events/
│   │       └── SlotCreatedEvent.js
│   ├── infrastructure/
│   │   ├── api/
│   │   │   ├── express.js
│   │   │   └── graphql.js
│   │   ├── messaging/
│   │   │   └── RabbitMQAdapter.js
│   │   └── persistence/
│   │       ├── SupabaseEventStore.js
│   │       └── SupabaseSnapshotStore.js
│   └── projections/
│       ├── EventConsumer.js
│       └── SlotProjection.js
└── index.js
```

**Integration:**

- ถูกเรียกใช้โดย `user-car-service` เพื่อคำนวณ capacity ของแต่ละสถานที่จอดรถ
- ใช้ในการคำนวณความว่างของช่องเวลา (Time Slots Availability)

---

### 4. 📊 Recently Service (`recently-service/`)

**Port:** `3005`

**หน้าที่หลัก:**

- จัดการกิจกรรมล่าสุด (Recent Activities)
- ติดตามการเปลี่ยนแปลงต่างๆ ในระบบ
- แสดงประวัติการใช้งานของผู้ใช้

**Domain Model:**

- **Projections:**
  - `ActivityProjection` - Projection สำหรับสร้าง Recent Activity
- **Read Model:** `recently_activity_read_model` table

**API Endpoints:**

- `GET /recent-activity/:userId` - ดึงกิจกรรมล่าสุดของผู้ใช้ (15 รายการล่าสุด)
- `GET /health` - Health check

**โครงสร้าง:**

```
recently-service/
├── src/
│   ├── infrastructure/
│   │   ├── messaging/
│   │   │   └── RabbitMQAdapter.js
│   │   └── persistence/
│   │       └── SupabaseEventStore.js
│   └── projections/
│       ├── EventConsumer.js
│       └── ActivityProjection.js
└── index.js
```

**Event Subscriptions:**

- `ReservationCreatedEvent` - สร้าง Activity เมื่อมีการจองใหม่
- `ParkingStatusUpdatedEvent` - สร้าง Activity เมื่อมีการอัปเดตสถานะ

**Features:**

- เก็บกิจกรรมล่าสุด 15 รายการต่อผู้ใช้
- เรียงลำดับจากใหม่ไปเก่า
- อัปเดตแบบ Real-time ผ่าน Event Consumer

---

## 🔄 การทำงานร่วมกัน (Service Interactions)

### Flow 1: สร้างผู้ใช้ใหม่ (Create User)

```
1. Frontend → API Gateway (POST /users)
2. API Gateway → User Service
3. User Service:
   ├─ สร้าง UserAggregate
   ├─ สร้าง UserCreatedEvent
   ├─ บันทึก Event ลง event_store
   └─ Publish Event ไปยัง RabbitMQ
4. RabbitMQ แจกจ่าย Event:
   ├─ User-Car Service → อัปเดต UserProjection
   └─ Recently Service → สร้าง Recent Activity
5. Response กลับไปยัง Frontend
```

### Flow 2: สร้างการจอง (Create Reservation)

```
1. Frontend → API Gateway (POST /reservations)
2. API Gateway → User-Car Service
3. User-Car Service:
   ├─ เรียก Slot Service เพื่อตรวจสอบ Capacity
   ├─ สร้าง ReservationAggregate
   ├─ สร้าง ReservationCreatedEvent
   ├─ บันทึก Event ลง event_store
   └─ Publish Event ไปยัง RabbitMQ
4. RabbitMQ แจกจ่าย Event:
   └─ Recently Service → สร้าง Recent Activity
5. EventConsumer ใน User-Car Service:
   └─ อัปเดต Read Model (reservations table)
6. Response กลับไปยัง Frontend
```

### Flow 3: เช็กอิน (Check-in)

```
1. Frontend → API Gateway (POST /check-ins)
2. API Gateway → User-Car Service
3. User-Car Service:
   ├─ ค้นหาการจองที่ pending จาก license_plate
   ├─ สร้าง UpdateParkingStatusCommand
   ├─ สร้าง ParkingStatusUpdatedEvent
   ├─ บันทึก Event ลง event_store
   └─ Publish Event ไปยัง RabbitMQ
4. RabbitMQ แจกจ่าย Event:
   └─ Recently Service → สร้าง Recent Activity
5. EventConsumer อัปเดต Read Model
6. Response กลับไปยัง Frontend
```

---

## 📊 ตารางสรุป Services

| Service              | Port | Domain      | หน้าที่หลัก            | Read Model                     |
| -------------------- | ---- | ----------- | ---------------------- | ------------------------------ |
| **User Service**     | 3001 | User        | จัดการผู้ใช้           | `user_read_model`              |
| **User-Car Service** | 3003 | Reservation | จัดการการจองและเช็กอิน | `reservations`, `cars`         |
| **Slot Service**     | 3006 | Slot        | จัดการช่องจอดรถ        | `slots`                        |
| **Recently Service** | 3005 | Activity    | จัดการกิจกรรมล่าสุด    | `recently_activity_read_model` |

---

## 🗄️ Infrastructure ที่ใช้ร่วมกัน

### RabbitMQ (Message Broker)

- **Exchange:** `events_exchange` (fanout)
- **Pattern:** Event-Driven Architecture
- **Purpose:** สื่อสาร Events ระหว่าง Services แบบ Asynchronous

### Supabase/PostgreSQL

- **Event Store:** `event_store` table
- **Snapshots:** `snapshots` table
- **Version Control:** `latest_versions` table
- **Read Models:** Tables สำหรับ Query

### Shared Library (`packages/common/`)

- `RabbitMQAdapter` - Adapter สำหรับ RabbitMQ
- `SupabaseEventStore` - Event Store สำหรับ Supabase

---

## 🚀 การรัน Services

### Development Mode

```bash
# Terminal 1: User Service
cd services/user-service && npm run dev

# Terminal 2: User-Car Service
cd services/user-car-service && npm run dev

# Terminal 3: Slot Service
cd services/slot-service && npm run dev

# Terminal 4: Recently Service
cd services/recently-service && npm run dev
```

### Prerequisites

1. **RabbitMQ** - ต้องรันอยู่ (ใช้ Docker: `docker-compose up -d`)
2. **Supabase** - Database ที่มี Schema และ Stored Functions
3. **Environment Variables** - ตั้งค่า `.env` ในแต่ละ service

---

## 📝 หมายเหตุ

- ทุก Service ใช้สถาปัตยกรรม **CQRS + Event Sourcing** เหมือนกัน
- การสื่อสารระหว่าง Services ใช้ **RabbitMQ Event Broker**
- แต่ละ Service มี **EventConsumer** เพื่อรับ Events และอัปเดต Read Model
- **Shared Library** (`packages/common/`) ใช้เพื่อลดการซ้ำซ้อนของโค้ด

---

_อัปเดตล่าสุด: 2025-11-22_
