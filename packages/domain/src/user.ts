import type { Brand } from "./brand.js";
import type { UserId } from "./ids.js";

export type AddressId = Brand<string, "AddressId">;

export interface Address {
  readonly id: AddressId;
  readonly userId: UserId;
  readonly label: string;
  readonly city: string;
  readonly street: string;
  readonly apartment?: string;
  readonly entrance?: string;
  readonly floor?: string;
  readonly comment?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

export interface DeliveryAddressInput {
  readonly label?: string;
  readonly city: string;
  readonly street: string;
  readonly apartment?: string;
  readonly entrance?: string;
  readonly floor?: string;
  readonly comment?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}
