// src/graphql/resolvers.js
import axios from "axios";

const resolvers = {
  Query: {
    user: async (_, { id }) => {
      const userServiceUrl = process.env.USER_SERVICE_URL;
      if (!userServiceUrl)
        throw new Error("USER_SERVICE_URL is not configured.");

      try {
        const response = await axios.get(`${userServiceUrl}/users/${id}`);
        return response.data;
      } catch (error) {
        console.error(`Error fetching user ${id}:`, error.message);
        return null;
      }
    },

    reservation: async (_, { id }) => {
      // Use USER_CAR_SERVICE_URL instead of RESERVATION_SERVICE_URL
      // Reservation functionality has been moved to user-car-service
      const userCarServiceUrl = process.env.USER_CAR_SERVICE_URL;
      if (!userCarServiceUrl)
        throw new Error("USER_CAR_SERVICE_URL is not configured.");

      try {
        const response = await axios.get(
          `${userCarServiceUrl}/reservations/${id}`
        );
        return response.data;
      } catch (error) {
        console.error(`Error fetching reservation ${id}:`, error.message);
        return null;
      }
    },

    recentActivities: async (_, { userId }) => {
      // 🔽 ย้ายการอ่าน process.env มาไว้ข้างในฟังก์ชัน 🔽
      const recentlyServiceUrl = process.env.RECENTLY_SERVICE_URL;
      if (!recentlyServiceUrl)
        throw new Error("RECENTLY_SERVICE_URL is not configured.");

      try {
        console.log(`[GraphQL] Fetching recent activities for user: ${userId}`);
        const response = await axios.get(
          `${recentlyServiceUrl}/recent-activity/${userId}`
        );
        return response.data;
      } catch (error) {
        console.error(
          `Error fetching recent activities for user ${userId}:`,
          error.message
        );
        return [];
      }
    },
  },

  User: {
    // แก้ไข resolver ที่เชื่อมกันให้ใช้ pattern เดียวกัน
    reservations: async (parent) => {
      // Use USER_CAR_SERVICE_URL instead of RESERVATION_SERVICE_URL
      const userCarServiceUrl = process.env.USER_CAR_SERVICE_URL;
      if (!userCarServiceUrl)
        throw new Error("USER_CAR_SERVICE_URL is not configured.");
      // TODO: Implement actual reservations query
      return [];
    },
    cars: async (parent) => {
      const userServiceUrl = process.env.USER_SERVICE_URL;
      if (!userServiceUrl)
        throw new Error("USER_SERVICE_URL is not configured.");
      // ...
    },
    recentActivities: async (parent) => {
      const recentlyServiceUrl = process.env.RECENTLY_SERVICE_URL;
      if (!recentlyServiceUrl)
        throw new Error("RECENTLY_SERVICE_URL is not configured.");
      // ...
    },
  },
};

export default resolvers;
