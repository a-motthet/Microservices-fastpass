// /services/user-service/src/infrastructure/projections/UserProjection.js
// หมายเหตุ: ในระบบจริง Projection ควรทำงานใน process แยก
// แต่สำหรับตัวอย่างนี้ เราจะเรียกใช้เมื่อได้รับ event ผ่าน consumer

export class UserProjection {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
  }

  async handleUserCreated(eventData) {
    // Adapter if needed, or just use eventData
    const data = eventData;
    // The previous code expected 'event.eventType' and 'event.data', but EventConsumer passes 'event_data' directly
    // Let's assume eventData IS the user object or contains it.
    // Looking at other handlers: handleReservationCreated(event_data)
    // So here we should probably destructure data directly.
    
    // Safety check if eventData has a wrapped structure or is flat
    const { id, name, email } = data;
    if (!id) { 
        console.warn("UserProjection: No ID found in event data", data);
        return; 
    }
      console.log(`📈 Projecting UserCreated: ${id}`);
      const { error } = await this.supabase.from("users").insert({
        id,
        name,
        email,
        status: "active",
        version: 1,
        updated_at: new Date(),
      });
      if (error) console.error("Error projecting UserCreated event:", error);
    }
}
