// /services/user-service/src/domain/commands/CreateUserCommand.js
export class CreateUserCommand {
  constructor(name, email) {
    this.name = name;
    this.email = email;
  }
}
