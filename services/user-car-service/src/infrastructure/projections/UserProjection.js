// /services/user-service/src/infrastructure/projections/UserProjection.js
// หมายเหตุ: ในระบบจริง Projection ควรทำงานใน process แยก
// แต่สำหรับตัวอย่างนี้ เราจะเรียกใช้เมื่อได้รับ event ผ่าน consumer

export class UserProjection {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  async handleEvent(event) {
    if (event.eventType === "UserCreated") {
      const { id, name, email } = event.data;
      console.log(`📈 Projecting UserCreated: ${id}`);
      const { error } = await this.supabase.from("users").insert({
        id,
        name,
        email,
        status: "ACTIVE",
        version: 1,
        updated_at: new Date(),
      });
      if (error) console.error("Error projecting UserCreated event:", error);
    }
  }
}
