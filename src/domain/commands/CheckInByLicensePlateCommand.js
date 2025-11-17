// src/domain/commands/CheckInByLicensePlateCommand.js
export class CheckInByLicensePlateCommand {
  constructor(licensePlate, checkInTimestamp) {
    if (!licensePlate) {
      throw new Error("License plate is required.");
    }
    this.licensePlate = licensePlate;
    this.checkInTimestamp = checkInTimestamp || new Date();
  }
}
