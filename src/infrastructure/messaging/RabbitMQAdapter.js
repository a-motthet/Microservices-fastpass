// src/infrastructure/messaging/RabbitMQAdapter.js

import amqp from "amqplib";

export class RabbitMQAdapter {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.queueName = "events_queue"; // กำหนดชื่อ Queue ไว้ที่ส่วนกลาง
  }

  /**
   * เชื่อมต่อกับ RabbitMQ Server และสร้าง Channel
   */
  async connect() {
    try {
      console.log("[DEBUG] 1. กำลังพยายามเชื่อมต่อ RabbitMQ...");
      const connectionString = process.env.RABBITMQ_URL || "amqp://localhost";
      this.connection = await amqp.connect(connectionString);
      console.log("[DEBUG] 2. เชื่อมต่อ RabbitMQ สำเร็จแล้ว!");

      this.channel = await this.connection.createChannel();
      console.log("[DEBUG] 3. สร้าง Channel สำเร็จ!");

      // ทำให้แน่ใจว่า Queue ปลายทางมีอยู่จริง
      await this.channel.assertQueue(this.queueName, { durable: true });
      console.log(`[DEBUG] 4. Queue '${this.queueName}' is ready.`);
    } catch (error) {
      console.error("❌ Failed to connect to RabbitMQ", error);
      // หากเชื่อมต่อไม่สำเร็จ ให้รอสักครู่แล้วลองใหม่
      setTimeout(() => this.connect(), 5000);
      throw error;
    }
  }

  /**
   * เมธอดสำหรับส่ง Event ไปยัง Queue
   * @param {object} event - Event object ที่ต้องการส่ง
   */
  async publishEvent(event) {
    if (!this.channel) {
      throw new Error("Channel is not available. Please connect first.");
    }
    const eventMessage = {
      event_type: event.constructor.name,
      event_data: event,
    };

    const message = Buffer.from(JSON.stringify(eventMessage));

    this.channel.sendToQueue(this.queueName, message, { persistent: true });
    console.log(
      `[RabbitMQ] Sent event '${eventMessage.event_type}' to queue '${this.queueName}'`
    );
  }

  /**
   * เมธอดสำหรับให้ส่วนอื่น (เช่น EventConsumer) ดึง Channel ไปใช้งาน
   * นี่คือฟังก์ชันที่ขาดไป!
   */
  getChannel() {
    return this.channel;
  }
}
