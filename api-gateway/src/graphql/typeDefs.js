import { gql } from "apollo-server-express";

const typeDefs = gql`
  type User {
    id: ID!
    name: String
    email: String
    status: String

    # ฟิลด์ที่เชื่อมไปยัง Type อื่น
    reservations: [Reservation]
    cars: [Car]
    recentActivities: [Activity]
  }

  type Reservation {
    id: ID!
    user_id: ID
    slot_id: String
    status: String
    reserved_at: String
    start_time: String
    end_time: String
  }

  type Car {
    id: ID!
    user_id: ID
    license_plate: String
    brand: String
  }

  type Activity {
    id: ID!
    reservation_id: ID!
    user_id: ID!
    slot_id: String
    status: String
    start_time: String
    end_time: String
    created_at: String
  }

  type Query {
    user(id: ID!): User
    reservation(id: ID!): Reservation
    recentActivities(userId: ID!): [Activity]
  }
`;

export default typeDefs;
