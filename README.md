# 🅿️ Parking Reservation System - Microservices Architecture

ระบบจองที่จอดรถที่ออกแบบด้วยสถาปัตยกรรม Microservices โดยใช้ Express.js และนำหลักการออกแบบที่ทันสมัยมาประยุกต์ใช้:

- **Hexagonal Architecture (Ports and Adapters):** แยก Business Logic ออกจากส่วน Technical Concern อย่างชัดเจน
- **CQRS (Command Query Responsibility Segregation):** แยกส่วนของการเขียน (Command) และการอ่าน (Query) ออกจากกัน
- **Event Sourcing:** เก็บทุกการเปลี่ยนแปลงในระบบในรูปแบบของ Event ทำให้สามารถตรวจสอบย้อนหลังและสร้างสถานะ ณ เวลาใดก็ได้
- **Monorepo Structure:** จัดการ Common Infrastructure ผ่าน Shared Package

---

## 🏛️ สถาปัตยกรรม

### Core Components

- **API Gateway (Port 4000):** Single Entry Point สำหรับ Frontend
  - REST API Proxy สำหรับ Commands
  - GraphQL สำหรับ Queries
  - Centralized routing และ CORS management

- **Microservices:**
  - **User Service (Port 3001):** จัดการข้อมูลผู้ใช้
  - **User-Car Service (Port 3003):** จัดการ Reservations และ Check-ins
  - **Slot Service (Port 3006):** จัดการช่องจอดรถ
  - **Recently Service (Port 3005):** ติดตาม Recent Activities

- **Common Package (`@parking-reservation/common`):**
  - `RabbitMQAdapter`: Unified message broker adapter
  - `SupabaseEventStore`: Event sourcing persistence
  - `Logger`: Winston-based centralized logging
  - `AppError` & `errorHandler`: Global error handling

- **Infrastructure:**
  - **RabbitMQ:** Event-driven communication ระหว่าง Services
  - **Supabase (PostgreSQL):**
    - `event_store`: Event Sourcing (Write Side)
    - Read Models: `user_read_model`, `reservation_read_model`, `slots` (Read Side)

---

## 📁 โครงสร้างโปรเจกต์

```
parking-reservation-system/
├── api-gateway/              # API Gateway (Port 4000)
├── packages/
│   └── common/              # Shared infrastructure & utilities
│       ├── src/
│       │   ├── infrastructure/
│       │   │   ├── messaging/RabbitMQAdapter.js
│       │   │   └── persistence/SupabaseEventStore.js
│       │   ├── utils/Logger.js
│       │   ├── errors/AppError.js
│       │   └── middlewares/errorHandler.js
│       └── package.json
├── services/
│   ├── user-service/        # Port 3001
│   ├── user-car-service/    # Port 3003
│   ├── slot-service/        # Port 3006
│   └── recently-service/    # Port 3005
├── docker-compose.yml       # RabbitMQ infrastructure
└── package.json             # Root workspace configuration
```

---

## 🚀 เริ่มต้นใช้งาน (Getting Started)

### 1. สิ่งที่ต้องมี (Prerequisites)

- [Node.js](https://nodejs.org/) (v18+)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- บัญชี [Supabase](https://supabase.com/)

### 2. การตั้งค่า (Setup)

#### ขั้นตอนที่ 1: Clone Repository

```bash
git clone <repository-url>
cd parking-reservation-system
```

#### ขั้นตอนที่ 2: ตั้งค่า Supabase

1. สร้างโปรเจกต์ใหม่บน [Supabase](https://supabase.com/)
2. ไปที่ **SQL Editor** และรันไฟล์ `schema.sql` เพื่อสร้างตารางทั้งหมด
3. ไปที่ **Project Settings > API** และคัดลอก:
   - `Project URL`
   - `anon (public) key`

#### ขั้นตอนที่ 3: ตั้งค่า Environment Variables

แต่ละ service มีไฟล์ `.env.example` ให้ทำการคัดลอกและแก้ไข:

```bash
# ในแต่ละ service directory
cp .env.example .env
```

แก้ไขค่าใน `.env`:

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-public-key-here

# RabbitMQ
RABBITMQ_URL=amqp://localhost

# Service Port (แตกต่างกันในแต่ละ service)
PORT=3001  # หรือ 3003, 3005, 3006 ตาม service
```

#### ขั้นตอนที่ 4: ติดตั้ง Dependencies

```bash
# ติดตั้ง dependencies สำหรับ common package
cd packages/common && npm install

# ติดตั้ง dependencies สำหรับแต่ละ service
cd ../../services/user-service && npm install
cd ../user-car-service && npm install
cd ../slot-service && npm install
cd ../recently-service && npm install

# ติดตั้ง dependencies สำหรับ API Gateway
cd ../../api-gateway && npm install
```

### 3. การรันโปรเจกต์ (Running the Application)

#### ขั้นตอนที่ 1: รัน Infrastructure (Docker)

```bash
# ที่ root directory
docker-compose up -d
```

คำสั่งนี้จะสตาร์ท RabbitMQ (Port 5672, Management UI: 15672)

#### ขั้นตอนที่ 2: รัน Services

เปิด Terminal แยกกันสำหรับแต่ละ service:

```bash
# Terminal 1: User Service
cd services/user-service && npm run dev

# Terminal 2: User-Car Service
cd services/user-car-service && npm run dev

# Terminal 3: Slot Service
cd services/slot-service && npm run dev

# Terminal 4: Recently Service
cd services/recently-service && npm run dev

# Terminal 5: API Gateway
cd api-gateway && npm run dev
```

### 4. ทดสอบการทำงาน (Testing)

#### Health Check

```bash
# ตรวจสอบ API Gateway
curl http://localhost:4000/health

# ตรวจสอบ User Service ผ่าน Gateway
curl http://localhost:4000/users/health
```

#### สร้างผู้ใช้ (Command - REST)

```bash
curl -X POST http://localhost:4000/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Thanakorn P.",
    "email": "thanakorn.p@example.com"
  }'
```

#### ดึงข้อมูลผู้ใช้ (Query - GraphQL)

เปิดเบราว์เซอร์ไปที่ `http://localhost:4000/graphql`:

```graphql
query GetUser {
  getUserById(id: "your-user-id-here") {
    id
    name
    email
    status
  }
}
```

---

## 🔧 Cross-Cutting Concerns

### Centralized Logging

ทุก service ใช้ Winston logger จาก common package:

```javascript
import { createLogger } from '@parking-reservation/common';

const logger = createLogger('service-name');
logger.info('Message');
logger.error('Error message', error);
```

### Global Error Handling

Error handling middleware จัดการ errors แบบรวมศูนย์:

```javascript
import { AppError, errorHandler } from '@parking-reservation/common';

// Throw custom errors
throw new AppError('Resource not found', 404);

// Register middleware
app.use(errorHandler);
```

---

## 📚 เอกสารเพิ่มเติม

- [CODE_ANALYSIS_REPORT.md](./CODE_ANALYSIS_REPORT.md) - การวิเคราะห์คุณภาพโค้ด
- [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md) - สรุปการ Refactor

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License.
