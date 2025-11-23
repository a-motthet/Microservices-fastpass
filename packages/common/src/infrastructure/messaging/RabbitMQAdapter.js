// packages/common/src/infrastructure/messaging/RabbitMQAdapter.js
// Shared RabbitMQ Adapter for all microservices
// Uses Exchange pattern (fanout) for event distribution

import amqp from "amqplib";

export class RabbitMQAdapter {
  constructor(serviceName = "Unknown") {
    this.connection = null;
    this.channel = null;
    this.serviceName = serviceName; // For logging purposes
    // ใช้ Exchange เพื่อให้รองรับหลาย Consumer และสอดคล้องกับ Service อื่นๆ
    this.exchangeName = "events_exchange";
  }

  /**
   * เชื่อมต่อกับ RabbitMQ Server และสร้าง Channel
   */
  async connect() {
    try {
      console.log(
        `[RabbitMQ][${this.serviceName}] กำลังพยายามเชื่อมต่อ RabbitMQ...`
      );
      const connectionString = process.env.RABBITMQ_URL || "amqp://localhost";
      this.connection = await amqp.connect(connectionString);
      console.log(
        `[RabbitMQ][${this.serviceName}] เชื่อมต่อ RabbitMQ สำเร็จแล้ว!`
      );

      this.channel = await this.connection.createChannel();
      console.log(`[RabbitMQ][${this.serviceName}] สร้าง Channel สำเร็จ!`);

      // สร้าง Exchange แบบ 'fanout' ถ้ายังไม่มี (สอดคล้องกับ Service อื่นๆ)
      await this.channel.assertExchange(this.exchangeName, "fanout", {
        durable: true,
      });
      console.log(
        `[RabbitMQ][${this.serviceName}] Exchange '${this.exchangeName}' is ready.`
      );
    } catch (error) {
      console.error(
        `❌ [${this.serviceName}] Failed to connect to RabbitMQ`,
        error
      );
      throw error;
    }
  }

  /**
   * เมธอดสำหรับส่ง Event ไปยัง Exchange
   * @param {object} event - Event object ที่ต้องการส่ง
   */
  async publishEvent(event) {
    if (!this.channel) {
      throw new Error(
        `[${this.serviceName}] RabbitMQ channel is not available. Please connect first.`
      );
    }
    const eventMessage = {
      event_type: event.constructor.name,
      event_data: event,
    };

    const message = Buffer.from(JSON.stringify(eventMessage));

    // ส่ง Event ไปที่ Exchange (routingKey เป็น '' สำหรับ fanout)
    this.channel.publish(this.exchangeName, "", message, { persistent: true });
    console.log(
      `[RabbitMQ][${this.serviceName}] Published event '${eventMessage.event_type}' to exchange '${this.exchangeName}'`
    );
  }

  /**
   * เมธอดสำหรับให้ส่วนอื่น (เช่น EventConsumer) ดึง Channel ไปใช้งาน
   */
  getChannel() {
    return this.channel;
  }
}

