// /services/slot-service/src/projections/SlotProjection.js
export class SlotProjection {
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error("SlotProjection requires a Supabase client.");
    }
    this.supabase = supabaseClient;
    this.tableName = "slots"; // 👈 ชื่อตาราง Read Model ที่เราสร้าง
  }

  /**
   * จัดการ Event การสร้าง Slot
   * @param {object} eventData - ข้อมูลจาก SlotCreatedEvent
   */
  async handleSlotCreated(eventData) {
    try {
      const { slotId, name, floor, details, status, parkingSiteId, floorId } = eventData;
      
      const { error } = await this.supabase.from(this.tableName).insert({
        id: slotId, // 👈 ID จาก Event
        name: name,
        floor: floor,
        details: details,
        parking_site_id: parkingSiteId,
        floor_id: floorId,
        status: status || "available", // 👈 สถานะจาก Event
        version: 1, // Version เริ่มต้น
      });

      if (error) throw error;
      console.log(`[SlotProjection] Projected new slot: ${name} (${slotId})`);
    } catch (error) {
      console.error(`[SlotProjection] Error handling SlotCreatedEvent:`, error);
    }
  }

  // (ในอนาคตจะมี handleSlotStatusUpdated(eventData) ที่นี่)
}
