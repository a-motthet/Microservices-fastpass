// /api-gateway/src/services.js
import dotenv from "dotenv";
dotenv.config();

const services = [
  {
    route: "/users",
    target: process.env.USER_SERVICE_URL || "http://localhost:3001",
  },
  {
    route: "/reservations",
    target: process.env.USER_CAR_SERVICE_URL || "http://localhost:3003",
  },
  {
    route: "/check-ins",
    target: process.env.USER_CAR_SERVICE_URL || "http://localhost:3003",
  },
  {
    route: "/recently",
    target: process.env.RECENTLY_SERVICE_URL || "http://localhost:3005",
  },
  {
    route: "/slots",
    target: process.env.SLOT_SERVICE_URL || "http://localhost:3006",
  },
  {
    route: "/sites",
    target: process.env.SLOT_SERVICE_URL || "http://localhost:3006",
  },
  // เพิ่ม Service อื่นๆ ที่นี่
];

export default services;
