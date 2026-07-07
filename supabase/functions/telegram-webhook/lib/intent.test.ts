import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isDeleteCommand } from "./intent.ts";

Deno.test("isDeleteCommand detects Spanish delete verbs", () => {
  assertEquals(isDeleteCommand("elimina un carro"), true);
  assertEquals(isDeleteCommand("quiero eliminar un auto"), true);
  assertEquals(isDeleteCommand("borra un carro"), true);
  assertEquals(isDeleteCommand("bórrame el mustang"), true);
  assertEquals(isDeleteCommand("quita ese auto"), true);
});

Deno.test("isDeleteCommand detects English delete verbs", () => {
  assertEquals(isDeleteCommand("delete a car"), true);
  assertEquals(isDeleteCommand("please remove this vehicle"), true);
});

Deno.test("isDeleteCommand ignores purchase messages", () => {
  assertEquals(isDeleteCommand("I bought a 2018 Ford Mustang for $8500 today"), false);
  assertEquals(isDeleteCommand("compré un 2020 Toyota Corolla en 7200"), false);
  assertEquals(isDeleteCommand("hola"), false);
});

Deno.test("isDeleteCommand handles uppercase and accented input", () => {
  assertEquals(isDeleteCommand("BORRAR TODO"), true);
  assertEquals(isDeleteCommand("BÓRRAME el mustang"), true);
  assertEquals(isDeleteCommand("ELIMINA UN CARRO"), true);
});
