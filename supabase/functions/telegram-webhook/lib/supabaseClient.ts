import { createClient } from "npm:@supabase/supabase-js@2";

export interface PendingAction {
  id: string;
  chatId: string;
  kind: string;
  payload: Record<string, unknown>;
}

export function createAppSupabaseClient(url: string, serviceRoleKey: string) {
  const client = createClient(url, serviceRoleKey);

  async function getPendingAction(chatId: string): Promise<PendingAction | null> {
    const { data, error } = await client
      .from("bot_pending_actions")
      .select("id, chat_id, kind, payload")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`getPendingAction failed: ${error.message}`);
    if (!data) return null;
    return { id: data.id, chatId: data.chat_id, kind: data.kind, payload: data.payload };
  }

  async function setPendingAction(chatId: string, kind: string, payload: Record<string, unknown>): Promise<void> {
    await clearPendingAction(chatId);
    const { error } = await client.from("bot_pending_actions").insert([{ chat_id: chatId, kind, payload }]);
    if (error) throw new Error(`setPendingAction failed: ${error.message}`);
  }

  async function clearPendingAction(chatId: string): Promise<void> {
    const { error } = await client.from("bot_pending_actions").delete().eq("chat_id", chatId);
    if (error) throw new Error(`clearPendingAction failed: ${error.message}`);
  }

  async function listCars(): Promise<{ id: string; data: Record<string, unknown>; created_at: string }[]> {
    const { data, error } = await client.from("cars").select("id, data, created_at");
    if (error) throw new Error(`listCars failed: ${error.message}`);
    return data ?? [];
  }

  async function insertCar(carData: Record<string, unknown>): Promise<string> {
    const { data, error } = await client.from("cars").insert([{ data: carData }]).select("id").single();
    if (error) throw new Error(`insertCar failed: ${error.message}`);
    return data.id;
  }

  async function updateCarData(carId: string, carData: Record<string, unknown>): Promise<void> {
    const { error } = await client.from("cars").update({ data: carData }).eq("id", carId);
    if (error) throw new Error(`updateCarData failed: ${error.message}`);
  }

  async function deleteCar(carId: string): Promise<void> {
    const { error } = await client.from("cars").delete().eq("id", carId);
    if (error) throw new Error(`deleteCar failed: ${error.message}`);
  }

  return { getPendingAction, setPendingAction, clearPendingAction, listCars, insertCar, updateCarData, deleteCar };
}
