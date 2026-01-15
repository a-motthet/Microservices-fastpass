// src/domain/commands/UpdateParkingStatusCommand.js

export class UpdateParkingStatusCommand {
  /**
   * @param {string} reservationId
   * @param {string} newStatus
   */
  constructor(reservationId, newStatus) {
    if (!reservationId || !newStatus) {
      throw new Error("Reservation ID and new status are required.");
    }
    this.reservationId = reservationId;
    this.newStatus = newStatus;
  }
}
