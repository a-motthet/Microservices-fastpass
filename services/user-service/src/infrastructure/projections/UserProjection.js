// /services/user-service/src/projections/UserProjection.js

export class UserProjection {
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error("Supabase client is required for UserProjection.");
    }
    this.supabase = supabaseClient;
    this.tableName = "users";
  }

  async handleUserCreated(eventData) {
    // --- 🔽 แก้ไขตรงนี้: ดึงข้อมูลจาก eventData.data 🔽 ---
    const { id, name, email } = eventData.data || {}; // ใช้ || {} ป้องกัน error ถ้า .data ไม่มีอยู่
    const status = "active";

    // Validation ยังคงเหมือนเดิม
    if (!id || !name || !email) {
      // แก้ไข Error message ให้ตรงกับปัญหา
      console.error(
        "[UserProjection] Error: Missing id, name, or email inside eventData.data:",
        eventData
      );
      return;
    }

    console.log(
      `[UserProjection] Projecting UserCreatedEvent for user ID: ${id}`
    );

    const { error } = await this.supabase.from(this.tableName).insert({
      id: id,
      name: name,
      email: email,
      status: status,
      version: 1,
      updated_at: new Date(),
    });

    if (error) {
      console.error(`[UserProjection] Error inserting user ${id}:`, error);
    } else {
      console.log(`[UserProjection] Successfully projected user ${id}`);
    }
  }
}
