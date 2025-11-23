// /services/user-service/src/infrastructure/persistence/SupabaseSnapshotStore.js

export class SupabaseSnapshotStore {
  /**
   * @param {object} supabaseClient - Instance of the Supabase client
   */
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error(
        "Supabase client must be provided to SupabaseSnapshotStore."
      );
    }
    this.supabase = supabaseClient;
    this.tableName = "snapshots"; // Name of the snapshot table
  }

  /**
   * Saves a snapshot to the database (inserts or updates if exists).
   * @param {string} aggregateId - The ID of the aggregate.
   * @param {object} snapshotData - The current state object of the aggregate (from .getState()).
   * @param {number} version - The version of the aggregate when the snapshot was taken.
   */
  async saveSnapshot(aggregateId, snapshotData, version) {
    console.log(
      `[SnapshotStore][UserSvc] Saving snapshot for aggregate ${aggregateId} at version ${version}`
    );

    // Use upsert: inserts if aggregate_id doesn't exist, updates if it does.
    const { error } = await this.supabase.from(this.tableName).upsert(
      {
        aggregate_id: aggregateId,
        snapshot_data: snapshotData,
        version: version,
        created_at: new Date(), // Update the timestamp
      },
      {
        onConflict: "aggregate_id", // Specify the column to check for conflicts
      }
    );

    if (error) {
      console.error(
        `[SnapshotStore][UserSvc] Error saving snapshot for aggregate ${aggregateId}:`,
        error
      );
      throw new Error(`Could not save snapshot for aggregate ${aggregateId}.`);
    }
    console.log(
      `[SnapshotStore][UserSvc] Snapshot saved successfully for ${aggregateId}`
    );
  }

  /**
   * Loads the latest snapshot for a given aggregate ID.
   * @param {string} aggregateId - The ID of the aggregate to load.
   * @returns {Promise<object|null>} The snapshot object { aggregate_id, snapshot_data, version, created_at } or null if not found.
   */
  async loadSnapshot(aggregateId) {
    console.log(
      `[SnapshotStore][UserSvc] Loading snapshot for aggregate ${aggregateId}`
    );

    const { data, error } = await this.supabase
      .from(this.tableName)
      .select("*")
      .eq("aggregate_id", aggregateId)
      .single(); // Expect only one row (or none)

    // Handle errors, but ignore the "Row not found" error (PGRST116)
    if (error && error.code !== "PGRST116") {
      console.error(
        `[SnapshotStore][UserSvc] Error loading snapshot for aggregate ${aggregateId}:`,
        error
      );
      throw new Error(`Could not load snapshot for aggregate ${aggregateId}.`);
    }

    if (data) {
      console.log(
        `[SnapshotStore][UserSvc] Snapshot found for ${aggregateId} at version ${data.version}`
      );
      return data; // Return the full snapshot record
    } else {
      console.log(
        `[SnapshotStore][UserSvc] No snapshot found for ${aggregateId}. Will load from event stream.`
      );
      return null; // Return null if no snapshot exists
    }
  }
}
