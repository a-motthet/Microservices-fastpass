// user-car-service/src/infrastructure/persistence/SupabaseSnapshotStore.js

export class SupabaseSnapshotStore {
  /**
   * @param {object} supabaseClient - Instance ของ Supabase client
   */
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error(
        "Supabase client must be provided to SupabaseSnapshotStore."
      );
    }
    this.supabase = supabaseClient;
    this.tableName = "snapshots"; // ชื่อตารางที่เก็บ snapshot
  }

  /**
   * บันทึก Snapshot ลงฐานข้อมูล (สร้างใหม่ หรือ อัปเดตทับถ้ามีอยู่แล้ว)
   * @param {string} aggregateId - ID ของ Aggregate
   * @param {object} snapshotData - ข้อมูลสถานะล่าสุดของ Aggregate (จากเมธอด .getState())
   * @param {number} version - เวอร์ชันของ Aggregate ณ ตอนที่ทำ Snapshot
   */
  async saveSnapshot(aggregateId, snapshotData, version) {
    console.log(
      `[SnapshotStore] Saving snapshot for aggregate ${aggregateId} at version ${version}`
    );

    // ใช้ upsert เพื่อให้ทำงานได้ทั้ง INSERT และ UPDATE
    // ถ้า aggregate_id ซ้ำกัน จะทำการอัปเดตข้อมูล snapshot_data และ version แทน
    const { error } = await this.supabase.from(this.tableName).upsert(
      {
        aggregate_id: aggregateId,
        snapshot_data: snapshotData,
        version: version,
        created_at: new Date(), // อัปเดตเวลาล่าสุดที่ snapshot
      },
      {
        onConflict: "aggregate_id", // ระบุคอลัมน์ที่ใช้เช็ก conflict
      }
    );

    if (error) {
      console.error("Error saving snapshot:", error);
      throw new Error(`Could not save snapshot for aggregate ${aggregateId}.`);
    }
    console.log(
      `[SnapshotStore] Snapshot saved successfully for ${aggregateId}`
    );
  }

  /**
   * โหลด Snapshot ล่าสุดของ Aggregate จากฐานข้อมูล
   * @param {string} aggregateId - ID ของ Aggregate ที่ต้องการโหลด
   * @returns {Promise<object|null>} ข้อมูล Snapshot หรือ null ถ้าไม่พบ
   */
  async loadSnapshot(aggregateId) {
    console.log(
      `[SnapshotStore] Loading snapshot for aggregate ${aggregateId}`
    );

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*") // ดึงข้อมูลทั้งหมดของ snapshot
      .eq("aggregate_id", aggregateId)
      .single(); // คาดหวังผลลัพธ์แค่แถวเดียว

    // ตรวจสอบ Error (ยกเว้น Error 'PGRST116' ซึ่งหมายถึง 'Row not found')
    if (error && error.code !== "PGRST116") {
      console.error("Error loading snapshot:", error);
      throw new Error(`Could not load snapshot for aggregate ${aggregateId}.`);
    }

    if (data) {
      console.log(
        `[SnapshotStore] Snapshot found for ${aggregateId} at version ${data.version}`
      );
    } else {
      console.log(
        `[SnapshotStore] No snapshot found for ${aggregateId}. Will load from event stream.`
      );
    }

    // คืนค่า data (ซึ่งจะเป็น object ถ้าเจอ) หรือ null ถ้าไม่เจอ
    return data || null;
  }
}
