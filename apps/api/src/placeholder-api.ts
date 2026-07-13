import type { ApiContract } from "@altyn-market/domain";
import type { AuthService } from "./auth-service.js";

const notImplemented = async <T>(): Promise<T> => {
  throw new Error("API endpoint is scaffolded but not implemented yet.");
};

export const createPlaceholderApiContract = (
  authService: AuthService,
): ApiContract => ({
  auth: {
    requestOtp: (input) => authService.requestOtp(input.phone),
    verifyOtp: (input) =>
      authService.verifyOtp(input.phone, input.code, input.deviceName),
    refreshSession: () => notImplemented(),
    getCurrentSession: (accessToken) =>
      authService.getCurrentSession(accessToken),
  },
  catalog: {
    listCategories: () => notImplemented(),
    listProducts: () => notImplemented(),
    getProductPrice: () => notImplemented(),
  },
  cart: {
    addItem: () => notImplemented(),
    removeItem: () => notImplemented(),
    checkout: () => notImplemented(),
  },
  orders: {
    getOrder: () => notImplemented(),
    listMyOrders: () => notImplemented(),
  },
  picking: {
    listAssignedTasks: () => notImplemented(),
    cancelItem: () => notImplemented(),
    completePicking: () => notImplemented(),
  },
  delivery: {
    listAssignedTasks: () => notImplemented(),
    updateStatus: () => notImplemented(),
  },
  admin: {
    listOrders: () => notImplemented(),
    assignPicker: () => notImplemented(),
    assignCourier: () => notImplemented(),
    getMetrics: () => notImplemented(),
  },
});
