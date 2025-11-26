// /services/user-car-service/src/projections/HistoryProjection.js

export class HistoryProjection {
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error("HistoryProjection requires a Supabase client.");
    }
    this.supabase = supabaseClient;
    this.tableName = "reservations_history";
  }

  /**
   * บันทึกประวัติเมื่อมีการสร้างการจอง
   */
  async handleReservationCreated(eventData) {
    try {
      const { 
        reservationId, slotId, parkingSiteId, floorId,
        startDateLocal, startTimeLocal, endDateLocal, endTimeLocal 
      } = eventData;

      // สร้างคำอธิบายที่อ่านง่าย
      const description = `สร้างการจองใหม่: ที่จอด ${slotId} (ชั้น ${floorId || '-'}, สาขา ${parkingSiteId}) เวลา ${startDateLocal} ${startTimeLocal} - ${endTimeLocal}`;

      await this._insertHistory(reservationId, description, eventData);
      console.log(`[HistoryProjection] Logged 'Created' for ${reservationId}`);
    } catch (error) {
      console.error(`[HistoryProjection] Error logging created event:`, error);
    }
  }

  /**
   * บันทึกประวัติเมื่อมีการอัปเดตสถานะ
   */
  async handleParkingStatusUpdated(eventData) {
    try {
      const { reservationId, newStatus } = eventData;
      let description = '';

      switch (newStatus) {
        case 'checked_in': description = '🚗 รถเข้าจอดแล้ว (Checked-in)'; break;
        case 'checked_out': description = '👋 รถออกจากที่จอดแล้ว (Checked-out)'; break;
        case 'cancelled': description = '❌ การจองถูกยกเลิก'; break;
        default: description = `สถานะเปลี่ยนเป็น: ${newStatus}`;
      }

      await this._insertHistory(reservationId, description, eventData);
      console.log(`[HistoryProjection] Logged 'StatusUpdated' (${newStatus}) for ${reservationId}`);
    } catch (error) {
      console.error(`[HistoryProjection] Error logging status update:`, error);
    }
  }

  // Helper function เพื่อลด code ซ้ำซ้อน
  async _insertHistory(reservationId, description, details) {
    const { error } = await this.supabase.from(this.tableName).insert({
      reservation_id: reservationId,
      description: description,
      details: details // เก็บข้อมูลดิบไว้เผื่อใช้
    });
    if (error) throw error;
  }
}