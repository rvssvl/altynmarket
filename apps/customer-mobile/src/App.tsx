import {
  createAuthClient,
  createCustomerAppClient,
  type CustomerAppClient,
  type CustomerCartSnapshot,
  type CustomerCatalogProduct,
  type CustomerCheckoutAddress,
  type CustomerPaymentMethod,
  type PushPlatform,
} from "@altyn-market/client";
import type {
  AuthSession,
  Category,
  Order,
  Payment,
  RealtimeEvent,
} from "@altyn-market/domain";
import { RegistryProvider, useAtom } from "@effect/atom-react";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as Atom from "effect/unstable/reactivity/Atom";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

type Screen = "catalog" | "cart" | "checkout" | "orders" | "profile";
type BackendState = "checking" | "online" | "offline";
type AuthStep = "phone" | "code";
type RealtimeState = "idle" | "polling" | "subscribed";
type PushState =
  | { readonly status: "idle"; readonly label: string }
  | { readonly status: "checking"; readonly label: string }
  | { readonly status: "enabled"; readonly label: string }
  | { readonly status: "disabled"; readonly label: string }
  | { readonly status: "unavailable"; readonly label: string };

const customerSessionAtom = Atom.make<AuthSession | undefined>(undefined);
const customerBackendStateAtom = Atom.make<BackendState>("checking");

type CheckoutAddressForm = {
  readonly city: string;
  readonly street: string;
  readonly apartment: string;
  readonly entrance: string;
  readonly floor: string;
  readonly comment: string;
};

type RealtimeMessageEvent = {
  readonly data: string;
};

type EventSourceLike = {
  addEventListener: (
    type: string,
    listener: (event: RealtimeMessageEvent) => void,
  ) => void;
  close: () => void;
  onerror?: (() => void) | null;
};

type EventSourceConstructor = new (url: string) => EventSourceLike;

const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://api-staging.altyn-market.kz";
const sessionStorageKey = "altyn-market.customer.session";
const secureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const deliveryFeePreviewMinor = 150_000;
const emptyCart: CustomerCartSnapshot = { id: "", userId: "", items: [] };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function App() {
  return (
    <RegistryProvider>
      <CustomerApp />
    </RegistryProvider>
  );
}

function CustomerApp() {
  const [screen, setScreen] = useState<Screen>("catalog");
  const [phone, setPhone] = useState("+7 ");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [authStep, setAuthStep] = useState<AuthStep>("phone");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>();
  const [sessionLoading, setSessionLoading] = useState(true);
  const [session, setSession] = useAtom(customerSessionAtom);
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [catalog, setCatalog] = useState<readonly CustomerCatalogProduct[]>([]);
  const [cart, setCart] = useState<CustomerCartSnapshot>(emptyCart);
  const [orders, setOrders] = useState<readonly Order[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | undefined>();
  const [cartBusyProductId, setCartBusyProductId] = useState<
    string | undefined
  >();
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [backendState, setBackendState] = useAtom(customerBackendStateAtom);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("idle");
  const [pushState, setPushState] = useState<PushState>({
    status: "idle",
    label: "Push not enabled",
  });
  const [paymentMethod, setPaymentMethod] =
    useState<CustomerPaymentMethod>("kaspi");
  const [lastPayment, setLastPayment] = useState<
    | {
        readonly orderId: string;
        readonly payment: Payment;
        readonly paymentMethod: CustomerPaymentMethod;
      }
    | undefined
  >();
  const [paymentWebUrl, setPaymentWebUrl] = useState<string | undefined>();
  const [addressForm, setAddressForm] = useState<CheckoutAddressForm>({
    city: "Almaty",
    street: "",
    apartment: "",
    entrance: "",
    floor: "",
    comment: "",
  });

  const sessionRef = useRef<AuthSession | undefined>(undefined);
  sessionRef.current = session;
  const pushStateRef = useRef<PushState>(pushState);
  pushStateRef.current = pushState;

  const authClient = useMemo(() => createAuthClient(apiBaseUrl), []);
  const customerClient = useMemo(
    () =>
      createCustomerAppClient(
        apiBaseUrl,
        () => sessionRef.current?.accessToken,
      ),
    [],
  );

  const cartQuantityByProduct = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const line of cart.items) {
      quantities.set(line.product.id, line.quantity);
    }
    return quantities;
  }, [cart.items]);

  const categoryNameById = useMemo(() => {
    const names = new Map<string, string>();
    for (const category of categories) {
      names.set(category.id, category.name);
    }
    return names;
  }, [categories]);

  const subtotalMinor = useMemo(
    () =>
      cart.items.reduce(
        (sum, line) =>
          sum + line.quantity * line.price.customerPrice.amountMinor,
        0,
      ),
    [cart.items],
  );
  const basketCount = useMemo(
    () => cart.items.reduce((sum, line) => sum + line.quantity, 0),
    [cart.items],
  );
  const checkoutTotalMinor =
    subtotalMinor + (cart.items.length > 0 ? deliveryFeePreviewMinor : 0);

  const visibleCatalog = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return catalog.filter(({ product }) => {
      const matchesSearch =
        !normalizedSearch ||
        product.name.toLowerCase().includes(normalizedSearch) ||
        (product.description?.toLowerCase().includes(normalizedSearch) ??
          false);
      const matchesCategory =
        categoryFilter === "all" || product.categoryId === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [catalog, categoryFilter, search]);

  useEffect(() => {
    void checkBackend();
    void restoreSession();
  }, []);

  useEffect(() => {
    if (!session) {
      setRealtimeState("idle");
      return;
    }

    void loadCustomerData(customerClient);
    void registerForPushNotifications(customerClient);

    const pollOrders = setInterval(() => {
      void refreshOrders(customerClient);
    }, 10_000);
    const closeRealtime = subscribeToRealtime(
      session.accessToken,
      customerClient,
    );

    return () => {
      clearInterval(pollOrders);
      closeRealtime?.();
    };
  }, [customerClient, session?.accessToken]);

  async function checkBackend() {
    setBackendState("checking");

    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      setBackendState(response.ok ? "online" : "offline");
    } catch {
      setBackendState("offline");
    }
  }

  async function restoreSession() {
    setSessionLoading(true);

    try {
      const raw = await SecureStore.getItemAsync(
        sessionStorageKey,
        secureStoreOptions,
      );

      if (!raw) {
        return;
      }

      const storedSession = JSON.parse(raw) as AuthSession;
      const expiresSoon =
        Date.parse(storedSession.expiresAt) < Date.now() + 60_000;
      const nextSession = expiresSoon
        ? await authClient.refreshSession({
            refreshToken: storedSession.refreshToken,
            deviceName: getDeviceName(),
          })
        : await authClient.getCurrentSession(storedSession.accessToken);

      await persistSession(nextSession);
      setSession(nextSession);
      setPhone(nextSession.customer.phone.e164);
    } catch {
      await clearPersistedSession();
    } finally {
      setSessionLoading(false);
    }
  }

  async function persistSession(nextSession: AuthSession) {
    await SecureStore.setItemAsync(
      sessionStorageKey,
      JSON.stringify(nextSession),
      secureStoreOptions,
    );
  }

  async function clearPersistedSession() {
    await SecureStore.deleteItemAsync(
      sessionStorageKey,
      secureStoreOptions,
    ).catch(() => undefined);
  }

  async function loadCustomerData(client: CustomerAppClient) {
    setDataLoading(true);
    setDataError(undefined);

    try {
      const [nextCategories, nextCatalog, nextCart, nextOrders] =
        await Promise.all([
          client.listCategories(),
          client.listProducts(),
          client.getCart(),
          client.listOrders(),
        ]);
      setCategories(nextCategories.filter((category) => category.isActive));
      setCatalog(nextCatalog);
      setCart(nextCart);
      setOrders(sortOrders(nextOrders));
      setExpandedOrderId((current) => current || nextOrders[0]?.id || "");
      setBackendState("online");
    } catch (error) {
      setDataError(toErrorMessage(error, "Could not load customer data."));
      setBackendState("offline");
    } finally {
      setDataLoading(false);
    }
  }

  async function refreshOrders(client: CustomerAppClient) {
    try {
      const nextOrders = await client.listOrders();
      setOrders(sortOrders(nextOrders));
    } catch (error) {
      setDataError(toErrorMessage(error, "Could not refresh orders."));
    }
  }

  function subscribeToRealtime(
    accessToken: string,
    client: CustomerAppClient,
  ): (() => void) | undefined {
    const EventSourceCtor = (
      globalThis as { EventSource?: EventSourceConstructor }
    ).EventSource;

    if (!EventSourceCtor) {
      setRealtimeState("polling");
      return undefined;
    }

    const source = new EventSourceCtor(
      `${apiBaseUrl}/realtime?access_token=${encodeURIComponent(accessToken)}`,
    );
    const handleEvent = (event: RealtimeMessageEvent) => {
      try {
        const realtimeEvent = JSON.parse(event.data) as RealtimeEvent;
        if (
          realtimeEvent.type === "order.updated" ||
          realtimeEvent.type === "payment.updated"
        ) {
          void refreshOrders(client);
          void notifyOrderUpdate(realtimeEvent);
        }
      } catch {
        setRealtimeState("polling");
      }
    };

    source.addEventListener("order.updated", handleEvent);
    source.addEventListener("payment.updated", handleEvent);
    source.onerror = () => setRealtimeState("polling");
    setRealtimeState("subscribed");

    return () => source.close();
  }

  async function notifyOrderUpdate(
    event: Extract<
      RealtimeEvent,
      { readonly type: "order.updated" | "payment.updated" }
    >,
  ) {
    if (pushStateRef.current.status !== "enabled") {
      return;
    }

    const body =
      event.type === "payment.updated"
        ? `Payment is ${event.status}.`
        : `Order is ${formatStatus(event.status)}.`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Altyn Market order update",
        body,
        data: { orderId: event.orderId },
      },
      trigger: null,
    }).catch(() => undefined);
  }

  async function registerForPushNotifications(client: CustomerAppClient) {
    if (pushState.status === "enabled" || pushState.status === "checking") {
      return;
    }

    setPushState({ status: "checking", label: "Checking push permission" });

    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("orders", {
          name: "Order updates",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const permission = await Notifications.getPermissionsAsync();
      const requested =
        permission.status === "granted"
          ? permission
          : await Notifications.requestPermissionsAsync();

      if (requested.status !== "granted") {
        setPushState({
          status: "disabled",
          label: "Push permission not granted",
        });
        return;
      }

      const token = await getBestPushToken();
      await client.registerPushToken({
        token,
        platform: getPushPlatform(),
      });
      setPushState({
        status: "enabled",
        label: "Push enabled for order updates",
      });
    } catch (error) {
      setPushState({
        status: "unavailable",
        label: toErrorMessage(error, "Push unavailable in this build."),
      });
    }
  }

  async function getBestPushToken(): Promise<string> {
    try {
      const expoToken = await Notifications.getExpoPushTokenAsync();
      return expoToken.data;
    } catch {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      return typeof deviceToken.data === "string"
        ? deviceToken.data
        : JSON.stringify(deviceToken.data);
    }
  }

  async function setProductQuantity(productId: string, nextQuantity: number) {
    if (!session || cartBusyProductId) {
      return;
    }

    setCartBusyProductId(productId);
    setDataError(undefined);

    try {
      const nextCart =
        nextQuantity <= 0
          ? await customerClient.removeCartItem(productId)
          : await customerClient.setCartItemQuantity(productId, nextQuantity);
      setCart(nextCart);
    } catch (error) {
      setDataError(toErrorMessage(error, "Could not update basket."));
    } finally {
      setCartBusyProductId(undefined);
    }
  }

  async function requestOtp() {
    setAuthBusy(true);
    setAuthError(undefined);

    try {
      const result = await authClient.requestOtp(normalizePhone(phone));
      setDevCode(result.devCode);
      setCode(result.devCode ?? "");
      setAuthStep("code");
    } catch (error) {
      setAuthError(toErrorMessage(error, "Could not send OTP."));
    } finally {
      setAuthBusy(false);
    }
  }

  async function verifyOtp() {
    setAuthBusy(true);
    setAuthError(undefined);

    try {
      const nextSession = await authClient.verifyOtp({
        phone: normalizePhone(phone),
        code,
        deviceName: getDeviceName(),
      });
      await persistSession(nextSession);
      setSession(nextSession);
      setAuthStep("phone");
      setCode("");
      setDevCode(undefined);
    } catch (error) {
      setAuthError(toErrorMessage(error, "Could not verify OTP."));
    } finally {
      setAuthBusy(false);
    }
  }

  async function confirmCheckout() {
    if (checkoutBusy) {
      return;
    }

    const address = buildCheckoutAddress(addressForm);
    if (!address) {
      setCheckoutError("City and street are required.");
      return;
    }

    if (cart.items.length === 0) {
      setCheckoutError("Basket is empty.");
      return;
    }

    setCheckoutBusy(true);
    setCheckoutError(undefined);
    setNotice(undefined);

    try {
      const result = await customerClient.checkout({
        address,
        paymentMethod,
      });
      setCart(emptyCart);
      setLastPayment({
        orderId: result.order.id,
        payment: result.payment,
        paymentMethod,
      });
      setOrders((current) => sortOrders([result.order, ...current]));
      setExpandedOrderId(result.order.id);
      setNotice(`${shortId(result.order.id)} confirmed.`);
      setScreen("orders");
      await openPayment(result.payment);
    } catch (error) {
      setCheckoutError(toErrorMessage(error, "Checkout failed."));
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function openPayment(payment: Payment) {
    if (payment.deeplinkUrl) {
      try {
        await Linking.openURL(payment.deeplinkUrl);
        return;
      } catch {
        if (!payment.redirectUrl) {
          setNotice("Payment was created. Open your banking app to finish.");
          return;
        }
      }
    }

    if (payment.redirectUrl) {
      setPaymentWebUrl(payment.redirectUrl);
      return;
    }

    setNotice(`Payment is ${payment.status}.`);
  }

  async function logout() {
    await clearPersistedSession();
    setSession(undefined);
    setCart(emptyCart);
    setOrders([]);
    setLastPayment(undefined);
    setPushState({ status: "idle", label: "Push not enabled" });
    setScreen("catalog");
  }

  function renderAuthGate() {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
          <View style={styles.authHeader}>
            <Text style={styles.kicker}>Customer app</Text>
            <Text style={styles.title}>Altyn Market</Text>
            <Text style={styles.muted}>Login with your mobile phone.</Text>
          </View>

          <View style={styles.panel}>
            {authStep === "phone" ? (
              <>
                <Text style={styles.panelTitle}>Phone number</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="+77012345678"
                  style={styles.input}
                />
                <Pressable
                  disabled={authBusy}
                  style={[styles.primaryButton, authBusy && styles.disabled]}
                  onPress={requestOtp}
                >
                  <Text style={styles.primaryText}>
                    {authBusy ? "Sending..." : "Send code"}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.panelTitle}>Enter code</Text>
                <Text style={styles.muted}>
                  We sent an OTP to {normalizePhone(phone)}.
                </Text>
                {devCode ? (
                  <Text style={styles.devCode}>Stage code: {devCode}</Text>
                ) : null}
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="123456"
                  style={styles.input}
                />
                <Pressable
                  disabled={authBusy}
                  style={[styles.primaryButton, authBusy && styles.disabled]}
                  onPress={verifyOtp}
                >
                  <Text style={styles.primaryText}>
                    {authBusy ? "Checking..." : "Enter app"}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={authBusy}
                  style={styles.secondaryButton}
                  onPress={() => {
                    setAuthStep("phone");
                    setCode("");
                    setDevCode(undefined);
                  }}
                >
                  <Text style={styles.secondaryText}>Change phone</Text>
                </Pressable>
              </>
            )}

            {authError ? (
              <>
                <Text style={styles.errorText}>{authError}</Text>
                <Pressable
                  disabled={authBusy || backendState === "checking"}
                  style={styles.secondaryButton}
                  onPress={() => void checkBackend()}
                >
                  <Text style={styles.secondaryText}>
                    {backendState === "checking"
                      ? "Checking connection..."
                      : "Check connection"}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  function renderContent() {
    if (screen === "cart") {
      return renderCart();
    }

    if (screen === "checkout") {
      return renderCheckout();
    }

    if (screen === "orders") {
      return renderOrders();
    }

    if (screen === "profile") {
      return renderProfile();
    }

    return renderCatalog();
  }

  function renderCatalog() {
    return (
      <View style={styles.stack}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search products"
          style={styles.input}
        />

        <ScrollView
          keyboardShouldPersistTaps="handled"
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <Pressable
            style={[
              styles.filterChip,
              categoryFilter === "all" && styles.filterChipActive,
            ]}
            onPress={() => setCategoryFilter("all")}
          >
            <Text
              style={[
                styles.filterText,
                categoryFilter === "all" && styles.filterTextActive,
              ]}
            >
              All
            </Text>
          </Pressable>
          {categories.map((category) => (
            <Pressable
              key={category.id}
              style={[
                styles.filterChip,
                categoryFilter === category.id && styles.filterChipActive,
              ]}
              onPress={() => setCategoryFilter(category.id)}
            >
              <Text
                style={[
                  styles.filterText,
                  categoryFilter === category.id && styles.filterTextActive,
                ]}
              >
                {category.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {renderStatusMessages()}

        {dataLoading && catalog.length === 0 ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator color="#2f6f4e" />
            <Text style={styles.muted}>Loading catalog...</Text>
          </View>
        ) : null}

        <View style={styles.productGrid}>
          {visibleCatalog.map((item) => renderProductCard(item))}
        </View>

        {!dataLoading && visibleCatalog.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.muted}>No products match this filter.</Text>
          </View>
        ) : null}
      </View>
    );
  }

  function renderProductCard(item: CustomerCatalogProduct) {
    const { product, price } = item;
    const quantity = cartQuantityByProduct.get(product.id) ?? 0;
    const busy = cartBusyProductId === product.id;

    return (
      <View key={product.id} style={styles.productCard}>
        <View style={styles.productImageWrap}>
          {product.imageUrl ? (
            <Image
              accessibilityLabel={product.name}
              source={{ uri: product.imageUrl }}
              style={styles.productImage}
            />
          ) : (
            <View style={styles.productPlaceholder}>
              <Text style={styles.productPlaceholderText}>
                {product.name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          {quantity > 0 ? (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>
                {formatQuantity(quantity)}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.productBody}>
          <View style={styles.productCopy}>
            <Text style={styles.category}>
              {categoryNameById.get(product.categoryId) ?? "Catalog"}
            </Text>
            <Text style={styles.productName}>{product.name}</Text>
            {product.description ? (
              <Text style={styles.muted}>{product.description}</Text>
            ) : null}
            <Text style={styles.priceText}>
              {formatMoney(price.customerPrice)} / {product.unit}
            </Text>
          </View>
          {renderQuantityControl(product.id, quantity, busy)}
        </View>
      </View>
    );
  }

  function renderCart() {
    return (
      <View style={styles.stack}>
        {renderStatusMessages()}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Basket</Text>
          {cart.items.length === 0 ? (
            <Text style={styles.muted}>Add products from the catalog.</Text>
          ) : (
            cart.items.map((line) => {
              const busy = cartBusyProductId === line.product.id;
              return (
                <View key={line.product.id} style={styles.row}>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{line.product.name}</Text>
                    <Text style={styles.muted}>
                      {formatMoney(line.price.customerPrice)} /{" "}
                      {line.product.unit}
                    </Text>
                    {renderQuantityControl(
                      line.product.id,
                      line.quantity,
                      busy,
                    )}
                  </View>
                  <Text style={styles.rowPrice}>
                    {formatMoneyMinor(
                      line.quantity * line.price.customerPrice.amountMinor,
                    )}
                  </Text>
                </View>
              );
            })
          )}

          {renderPriceSummary()}

          <Pressable
            disabled={cart.items.length === 0}
            style={[
              styles.primaryButton,
              cart.items.length === 0 && styles.disabled,
            ]}
            onPress={() => setScreen("checkout")}
          >
            <Text style={styles.primaryText}>Checkout</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderCheckout() {
    return (
      <View style={styles.stack}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Checkout</Text>
          <TextInput
            value={addressForm.city}
            onChangeText={(city) =>
              setAddressForm((current) => ({ ...current, city }))
            }
            placeholder="City"
            style={styles.input}
          />
          <TextInput
            value={addressForm.street}
            onChangeText={(street) =>
              setAddressForm((current) => ({ ...current, street }))
            }
            placeholder="Street and building"
            style={styles.input}
          />
          <View style={styles.twoColumn}>
            <TextInput
              value={addressForm.apartment}
              onChangeText={(apartment) =>
                setAddressForm((current) => ({ ...current, apartment }))
              }
              placeholder="Apt"
              style={[styles.input, styles.flexInput]}
            />
            <TextInput
              value={addressForm.entrance}
              onChangeText={(entrance) =>
                setAddressForm((current) => ({ ...current, entrance }))
              }
              placeholder="Entrance"
              style={[styles.input, styles.flexInput]}
            />
          </View>
          <TextInput
            value={addressForm.floor}
            onChangeText={(floor) =>
              setAddressForm((current) => ({ ...current, floor }))
            }
            placeholder="Floor"
            style={styles.input}
          />
          <TextInput
            value={addressForm.comment}
            onChangeText={(comment) =>
              setAddressForm((current) => ({ ...current, comment }))
            }
            placeholder="Courier note"
            style={[styles.input, styles.multilineInput]}
            multiline
          />

          <Text style={styles.sectionLabel}>Payment method</Text>
          <View style={styles.segmentedControl}>
            {(["kaspi", "card"] as const).map((method) => (
              <Pressable
                key={method}
                style={[
                  styles.segmentButton,
                  paymentMethod === method && styles.segmentButtonActive,
                ]}
                onPress={() => setPaymentMethod(method)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    paymentMethod === method && styles.segmentTextActive,
                  ]}
                >
                  {method === "kaspi" ? "Kaspi" : "Card"}
                </Text>
              </Pressable>
            ))}
          </View>

          {renderPriceSummary()}

          <Pressable
            disabled={checkoutBusy || cart.items.length === 0}
            style={[
              styles.primaryButton,
              (checkoutBusy || cart.items.length === 0) && styles.disabled,
            ]}
            onPress={confirmCheckout}
          >
            <Text style={styles.primaryText}>
              {checkoutBusy ? "Confirming..." : "Confirm order"}
            </Text>
          </Pressable>

          {checkoutError ? (
            <Text style={styles.errorText}>{checkoutError}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  function renderOrders() {
    return (
      <View style={styles.stack}>
        {renderStatusMessages()}
        {renderPaymentPanel()}
        <View style={styles.ordersHeader}>
          <View>
            <Text style={styles.panelTitle}>Orders</Text>
            <Text style={styles.muted}>
              {realtimeState === "subscribed"
                ? "Live updates connected"
                : "Polling backend updates"}
            </Text>
          </View>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void refreshOrders(customerClient)}
          >
            <Text style={styles.secondaryText}>Refresh</Text>
          </Pressable>
        </View>

        {orders.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.muted}>No orders yet.</Text>
          </View>
        ) : null}

        {orders.map((order) => renderOrderCard(order))}
      </View>
    );
  }

  function renderOrderCard(order: Order) {
    const isExpanded = expandedOrderId === order.id;

    return (
      <View key={order.id} style={styles.orderCard}>
        <Pressable
          accessibilityRole="button"
          style={styles.orderSummary}
          onPress={() => setExpandedOrderId(isExpanded ? "" : order.id)}
        >
          <View style={styles.orderSummaryText}>
            <Text style={styles.orderId}>{shortId(order.id)}</Text>
            <Text style={styles.muted}>{formatDateTime(order.createdAt)}</Text>
          </View>
          <View style={styles.orderSummaryRight}>
            <Text style={styles.rowPrice}>{formatMoney(order.finalTotal)}</Text>
            <View
              style={[
                styles.statusPill,
                order.status === "delivered" && styles.statusPillDone,
              ]}
            >
              <Text style={styles.statusPillText}>
                {formatStatus(order.status)}
              </Text>
            </View>
          </View>
        </Pressable>

        {isExpanded ? (
          <View style={styles.orderDetails}>
            <View style={styles.detailGrid}>
              <View style={styles.detailBox}>
                <Text style={styles.detailLabel}>Payment</Text>
                <Text style={styles.detailValue}>
                  {paymentLabel(order.status)}
                </Text>
              </View>
              <View style={styles.detailBox}>
                <Text style={styles.detailLabel}>Delivery</Text>
                <Text style={styles.detailValue}>
                  {deliveryLabel(order.status)}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Address</Text>
            <Text style={styles.muted}>
              Address ID {shortId(order.addressId)}
            </Text>

            <Text style={styles.sectionLabel}>Groceries</Text>
            {order.items.map((item) => (
              <View key={item.id} style={styles.orderItemRow}>
                <View style={styles.orderItemMain}>
                  <Text style={styles.rowTitle}>
                    {item.productNameSnapshot}
                  </Text>
                  <Text style={styles.muted}>
                    {formatQuantity(
                      item.pickedQuantity ?? item.requestedQuantity,
                    )}{" "}
                    {item.unitSnapshot} x {formatMoney(item.unitPriceSnapshot)}
                  </Text>
                </View>
                <View style={styles.orderItemRight}>
                  <Text
                    style={[
                      styles.rowPrice,
                      item.status === "cancelled" && styles.cancelledText,
                    ]}
                  >
                    {formatMoneyMinor(
                      (item.pickedQuantity ?? item.requestedQuantity) *
                        item.unitPriceSnapshot.amountMinor,
                    )}
                  </Text>
                  <Text
                    style={[
                      styles.itemStatus,
                      item.status === "cancelled" && styles.cancelledText,
                    ]}
                  >
                    {item.status}
                  </Text>
                </View>
              </View>
            ))}

            <View style={styles.priceBreakdown}>
              <View style={styles.priceLine}>
                <Text style={styles.muted}>Groceries</Text>
                <Text style={styles.rowPrice}>
                  {formatMoney(order.goodsTotal)}
                </Text>
              </View>
              <View style={styles.priceLine}>
                <Text style={styles.muted}>Delivery</Text>
                <Text style={styles.rowPrice}>
                  {formatMoney(order.deliveryFee)}
                </Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.panelTitle}>Total</Text>
                <Text style={styles.panelTitle}>
                  {formatMoney(order.finalTotal)}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  function renderProfile() {
    return (
      <View style={styles.stack}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Profile</Text>
          <Text style={styles.rowTitle}>{session?.customer.phone.e164}</Text>
          <Text style={styles.muted}>
            Session expires {formatDate(session?.expiresAt)}
          </Text>
          <View style={styles.profileLine}>
            <Text style={styles.detailLabel}>Push</Text>
            <Text style={styles.detailValue}>{pushState.label}</Text>
          </View>
          <View style={styles.profileLine}>
            <Text style={styles.detailLabel}>Realtime</Text>
            <Text style={styles.detailValue}>{realtimeState}</Text>
          </View>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => void loadCustomerData(customerClient)}
          >
            <Text style={styles.secondaryText}>Reload backend data</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => void logout()}>
            <Text style={styles.primaryText}>Log out</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  function renderQuantityControl(
    productId: string,
    quantity: number,
    busy: boolean,
  ) {
    return (
      <View style={styles.quantityControl}>
        <Pressable
          disabled={busy || quantity <= 0}
          style={[
            styles.quantityButton,
            (busy || quantity <= 0) && styles.quantityButtonDisabled,
          ]}
          onPress={() => void setProductQuantity(productId, quantity - 1)}
        >
          <Text style={styles.quantityButtonText}>-</Text>
        </Pressable>
        <Text style={styles.quantityText}>
          {busy ? "..." : formatQuantity(quantity)}
        </Text>
        <Pressable
          disabled={busy}
          style={[styles.quantityButton, busy && styles.quantityButtonDisabled]}
          onPress={() => void setProductQuantity(productId, quantity + 1)}
        >
          <Text style={styles.quantityButtonText}>+</Text>
        </Pressable>
      </View>
    );
  }

  function renderPriceSummary() {
    return (
      <View style={styles.priceBreakdown}>
        <View style={styles.priceLine}>
          <Text style={styles.muted}>Groceries</Text>
          <Text style={styles.rowPrice}>{formatMoneyMinor(subtotalMinor)}</Text>
        </View>
        <View style={styles.priceLine}>
          <Text style={styles.muted}>Delivery</Text>
          <Text style={styles.rowPrice}>
            {cart.items.length > 0
              ? formatMoneyMinor(deliveryFeePreviewMinor)
              : formatMoneyMinor(0)}
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.panelTitle}>Total</Text>
          <Text style={styles.panelTitle}>
            {formatMoneyMinor(checkoutTotalMinor)}
          </Text>
        </View>
      </View>
    );
  }

  function renderPaymentPanel() {
    if (!lastPayment) {
      return null;
    }

    const { payment, paymentMethod: method, orderId } = lastPayment;
    const hasWebFlow = Boolean(payment.redirectUrl);
    const hasDeepLink = Boolean(payment.deeplinkUrl);

    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Order confirmed</Text>
        <Text style={styles.muted}>
          {shortId(orderId)} is in the backend order queue.
        </Text>
        <Text style={styles.muted}>
          {method === "kaspi" ? "Kaspi" : "Card"} payment is {payment.status}.
        </Text>
        <View style={styles.actionRow}>
          <Pressable
            disabled={!hasDeepLink && !hasWebFlow}
            style={[
              styles.primaryButton,
              styles.inlineButton,
              !hasDeepLink && !hasWebFlow && styles.disabled,
            ]}
            onPress={() => void openPayment(payment)}
          >
            <Text style={styles.primaryText}>
              {hasDeepLink ? "Open app" : hasWebFlow ? "Open checkout" : "Paid"}
            </Text>
          </Pressable>
          {hasWebFlow ? (
            <Pressable
              style={[styles.secondaryButton, styles.inlineButton]}
              onPress={() => setPaymentWebUrl(payment.redirectUrl)}
            >
              <Text style={styles.secondaryText}>Web checkout</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  function renderStatusMessages() {
    return (
      <>
        {notice ? <Text style={styles.successText}>{notice}</Text> : null}
        {dataError ? <Text style={styles.errorText}>{dataError}</Text> : null}
      </>
    );
  }

  function renderBottomNavigation() {
    const items: readonly {
      readonly screen: Exclude<Screen, "checkout">;
      readonly label: string;
    }[] = [
      { screen: "catalog", label: "Catalog" },
      { screen: "cart", label: "Basket" },
      { screen: "orders", label: "Orders" },
      { screen: "profile", label: "Profile" },
    ];

    return (
      <View style={styles.bottomNav}>
        {items.map((item) => {
          const active =
            screen === item.screen ||
            (screen === "checkout" && item.screen === "cart");
          return (
            <Pressable
              key={item.screen}
              accessibilityRole="button"
              style={[
                styles.bottomNavItem,
                active && styles.bottomNavItemActive,
              ]}
              onPress={() => setScreen(item.screen)}
            >
              {item.screen === "cart" ? (
                <View style={styles.basketIconWrap}>
                  <View style={styles.basketHandle} />
                  <View style={styles.basketIcon} />
                  {basketCount > 0 ? (
                    <View style={styles.basketBadge}>
                      <Text style={styles.basketBadgeText}>
                        {formatQuantity(basketCount)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View
                  style={[styles.navDotIcon, active && styles.navDotIconActive]}
                />
              )}
              <Text
                style={[
                  styles.bottomNavText,
                  active && styles.bottomNavTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (sessionLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.fullscreenCenter}>
          <ActivityIndicator color="#2f6f4e" />
          <Text style={styles.muted}>Restoring secure session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return renderAuthGate();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.authedContainer}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Customer app</Text>
            <Text style={styles.title}>Altyn Market</Text>
          </View>
          <Pressable
            style={[
              styles.status,
              backendState === "offline" && styles.statusOffline,
            ]}
            onPress={checkBackend}
          >
            <Text style={styles.statusText}>
              {backendState === "checking"
                ? "Checking"
                : backendState === "online"
                  ? "API online"
                  : "API offline"}
            </Text>
          </Pressable>
        </View>

        {renderContent()}
      </ScrollView>
      {renderBottomNavigation()}
      <Modal
        animationType="slide"
        visible={Boolean(paymentWebUrl)}
        onRequestClose={() => setPaymentWebUrl(undefined)}
      >
        <SafeAreaView style={styles.webviewSafe}>
          <View style={styles.webviewHeader}>
            <Text style={styles.panelTitle}>Payment</Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => setPaymentWebUrl(undefined)}
            >
              <Text style={styles.secondaryText}>Close</Text>
            </Pressable>
          </View>
          {paymentWebUrl ? (
            <WebView
              source={{ uri: paymentWebUrl }}
              startInLoadingState
              style={styles.webview}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const normalizePhone = (value: string): string =>
  value.trim().replace(/\s+/g, "");

const getDeviceName = (): string =>
  Platform.OS === "ios"
    ? "iOS customer app"
    : Platform.OS === "android"
      ? "Android customer app"
      : "Customer app";

const getPushPlatform = (): PushPlatform =>
  Platform.OS === "ios"
    ? "ios"
    : Platform.OS === "android"
      ? "android"
      : Platform.OS === "web"
        ? "web"
        : "unknown";

const buildCheckoutAddress = (
  form: CheckoutAddressForm,
): CustomerCheckoutAddress | undefined => {
  const city = form.city.trim();
  const street = form.street.trim();

  if (!city || !street) {
    return undefined;
  }

  return {
    city,
    street,
    label: "Home",
    ...(form.apartment.trim() ? { apartment: form.apartment.trim() } : {}),
    ...(form.entrance.trim() ? { entrance: form.entrance.trim() } : {}),
    ...(form.floor.trim() ? { floor: form.floor.trim() } : {}),
    ...(form.comment.trim() ? { comment: form.comment.trim() } : {}),
  };
};

const sortOrders = (orders: readonly Order[]): readonly Order[] =>
  [...orders].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
  );

const formatDate = (value: string | undefined): string =>
  value ? new Date(value).toLocaleDateString("ru-KZ") : "-";

const formatDateTime = (value: string): string =>
  new Date(value).toLocaleString("ru-KZ", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });

const formatMoney = (value: { readonly amountMinor: number }): string =>
  formatMoneyMinor(value.amountMinor);

const formatMoneyMinor = (amountMinor: number): string =>
  `${new Intl.NumberFormat("ru-KZ").format(amountMinor / 100)} KZT`;

const formatQuantity = (quantity: number): string =>
  Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(2).replace(/\.?0+$/, "");

const formatStatus = (status: string): string =>
  status
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");

const paymentLabel = (status: Order["status"]): string => {
  if (status === "payment_failed") {
    return "Payment failed";
  }

  if (
    status === "payment_captured" ||
    status === "awaiting_courier" ||
    status === "delivering" ||
    status === "delivered"
  ) {
    return "Captured";
  }

  if (status === "payment_authorized" || status === "awaiting_picking") {
    return "Authorized";
  }

  return "Pending";
};

const deliveryLabel = (status: Order["status"]): string => {
  if (status === "delivered") {
    return "Delivered";
  }

  if (status === "delivering") {
    return "Courier on the way";
  }

  if (status === "awaiting_courier") {
    return "Courier pending";
  }

  if (
    status === "picking" ||
    status === "picked" ||
    status === "payment_captured"
  ) {
    return "Preparing";
  }

  return "Not assigned";
};

const shortId = (value: string): string => value.slice(0, 8);

const toErrorMessage = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : fallback;
  return /fetch failed|network request failed|hostname could not be found/i.test(
    message,
  )
    ? "Could not reach Altyn Market. Check your connection and try again."
    : message;
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f4f6f2",
  },
  webviewSafe: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webview: {
    flex: 1,
  },
  webviewHeader: {
    alignItems: "center",
    borderBottomColor: "#dde3dc",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  authedContainer: {
    padding: 20,
    paddingBottom: 112,
  },
  fullscreenCenter: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  stack: {
    gap: 12,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  authHeader: {
    marginBottom: 22,
  },
  kicker: {
    color: "#637083",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    color: "#16211d",
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 36,
  },
  status: {
    borderColor: "#2f6f4e",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusOffline: {
    borderColor: "#b45339",
  },
  statusText: {
    color: "#24563d",
    fontSize: 13,
    fontWeight: "700",
  },
  filterRow: {
    gap: 8,
    paddingBottom: 2,
  },
  filterChip: {
    backgroundColor: "#ffffff",
    borderColor: "#d8dfd6",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterChipActive: {
    backgroundColor: "#2f6f4e",
    borderColor: "#2f6f4e",
  },
  filterText: {
    color: "#46545f",
    fontWeight: "800",
  },
  filterTextActive: {
    color: "#ffffff",
  },
  productGrid: {
    gap: 12,
  },
  productCard: {
    backgroundColor: "#ffffff",
    borderColor: "#d8dfd6",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  productImageWrap: {
    position: "relative",
  },
  productImage: {
    aspectRatio: 1.9,
    backgroundColor: "#e2e8dd",
    width: "100%",
  },
  productPlaceholder: {
    alignItems: "center",
    aspectRatio: 1.9,
    backgroundColor: "#d9e8d4",
    justifyContent: "center",
    width: "100%",
  },
  productPlaceholderText: {
    color: "#24563d",
    fontSize: 36,
    fontWeight: "900",
  },
  selectedBadge: {
    backgroundColor: "#d9a441",
    borderRadius: 999,
    position: "absolute",
    right: 12,
    top: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectedBadgeText: {
    color: "#1f2933",
    fontSize: 12,
    fontWeight: "900",
  },
  productBody: {
    gap: 12,
    padding: 16,
  },
  productCopy: {
    gap: 4,
  },
  category: {
    color: "#637083",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  productName: {
    color: "#16211d",
    fontSize: 22,
    fontWeight: "800",
  },
  priceText: {
    color: "#24563d",
    fontSize: 15,
    fontWeight: "800",
  },
  muted: {
    color: "#51606a",
    fontSize: 15,
    lineHeight: 21,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#d8dfd6",
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  panelTitle: {
    color: "#16211d",
    fontSize: 21,
    fontWeight: "800",
    marginBottom: 10,
  },
  row: {
    borderBottomColor: "#edf1eb",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  rowMain: {
    flex: 1,
    gap: 8,
  },
  rowTitle: {
    color: "#16211d",
    fontSize: 16,
    fontWeight: "800",
  },
  rowPrice: {
    color: "#16211d",
    fontWeight: "800",
  },
  quantityControl: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#f4f6f2",
    borderColor: "#d8dfd6",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 40,
    overflow: "hidden",
  },
  quantityButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    width: 44,
  },
  quantityButtonDisabled: {
    opacity: 0.35,
  },
  quantityButtonText: {
    color: "#24563d",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 24,
  },
  quantityText: {
    color: "#16211d",
    fontSize: 16,
    fontWeight: "800",
    minWidth: 44,
    textAlign: "center",
  },
  ordersHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  orderCard: {
    backgroundColor: "#ffffff",
    borderColor: "#d8dfd6",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  orderSummary: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    padding: 16,
  },
  orderSummaryText: {
    flex: 1,
    gap: 4,
  },
  orderSummaryRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  orderId: {
    color: "#16211d",
    fontSize: 18,
    fontWeight: "800",
  },
  statusPill: {
    backgroundColor: "#e6f2e8",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillDone: {
    backgroundColor: "#edf1eb",
  },
  statusPillText: {
    color: "#24563d",
    fontSize: 12,
    fontWeight: "800",
  },
  orderDetails: {
    borderTopColor: "#edf1eb",
    borderTopWidth: 1,
    padding: 16,
    paddingTop: 14,
  },
  detailGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  detailBox: {
    backgroundColor: "#f4f6f2",
    borderRadius: 8,
    flex: 1,
    padding: 12,
  },
  detailLabel: {
    color: "#637083",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  detailValue: {
    color: "#16211d",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },
  sectionLabel: {
    color: "#16211d",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 14,
    textTransform: "uppercase",
  },
  orderItemRow: {
    borderBottomColor: "#edf1eb",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  orderItemMain: {
    flex: 1,
  },
  orderItemRight: {
    alignItems: "flex-end",
  },
  itemStatus: {
    color: "#637083",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
    textTransform: "uppercase",
  },
  cancelledText: {
    color: "#9f3b2f",
    textDecorationLine: "line-through",
  },
  emptyBox: {
    backgroundColor: "#ffffff",
    borderColor: "#d8dfd6",
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  loadingPanel: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d8dfd6",
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  priceBreakdown: {
    paddingTop: 12,
  },
  priceLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 18,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2f6f4e",
    borderRadius: 8,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  inlineButton: {
    flex: 1,
    marginTop: 0,
  },
  primaryText: {
    color: "#ffffff",
    fontWeight: "800",
  },
  secondaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryText: {
    color: "#24563d",
    fontWeight: "800",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#cdd8ca",
    borderRadius: 8,
    borderWidth: 1,
    color: "#16211d",
    fontSize: 17,
    marginBottom: 12,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  flexInput: {
    flex: 1,
  },
  multilineInput: {
    minHeight: 82,
    paddingTop: 12,
  },
  twoColumn: {
    flexDirection: "row",
    gap: 10,
  },
  segmentedControl: {
    backgroundColor: "#f4f6f2",
    borderColor: "#d8dfd6",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 8,
    overflow: "hidden",
  },
  segmentButton: {
    alignItems: "center",
    flex: 1,
    paddingVertical: 12,
  },
  segmentButtonActive: {
    backgroundColor: "#2f6f4e",
  },
  segmentText: {
    color: "#51606a",
    fontWeight: "800",
  },
  segmentTextActive: {
    color: "#ffffff",
  },
  disabled: {
    opacity: 0.55,
  },
  devCode: {
    backgroundColor: "#fff7d6",
    borderRadius: 8,
    color: "#73510d",
    fontWeight: "800",
    marginVertical: 10,
    padding: 10,
  },
  errorText: {
    color: "#9f3b2f",
    fontWeight: "800",
    marginTop: 10,
  },
  successText: {
    color: "#24563d",
    fontWeight: "800",
    marginBottom: 2,
  },
  profileLine: {
    borderTopColor: "#edf1eb",
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
  },
  bottomNav: {
    backgroundColor: "#ffffff",
    borderColor: "#d8dfd6",
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    left: 0,
    paddingBottom: 10,
    paddingTop: 8,
    position: "absolute",
    right: 0,
  },
  bottomNavItem: {
    alignItems: "center",
    flex: 1,
    gap: 4,
    paddingVertical: 4,
  },
  bottomNavItemActive: {
    opacity: 1,
  },
  bottomNavText: {
    color: "#637083",
    fontSize: 12,
    fontWeight: "800",
  },
  bottomNavTextActive: {
    color: "#24563d",
  },
  navDotIcon: {
    backgroundColor: "#c9d4c6",
    borderRadius: 999,
    height: 19,
    width: 19,
  },
  navDotIconActive: {
    backgroundColor: "#2f6f4e",
  },
  basketIconWrap: {
    height: 24,
    position: "relative",
    width: 28,
  },
  basketHandle: {
    borderColor: "#637083",
    borderRadius: 8,
    borderWidth: 2,
    height: 12,
    left: 7,
    position: "absolute",
    top: 0,
    width: 14,
  },
  basketIcon: {
    backgroundColor: "#c9d4c6",
    borderRadius: 4,
    bottom: 0,
    height: 15,
    left: 2,
    position: "absolute",
    width: 24,
  },
  basketBadge: {
    alignItems: "center",
    backgroundColor: "#d9a441",
    borderRadius: 999,
    justifyContent: "center",
    minWidth: 18,
    paddingHorizontal: 5,
    position: "absolute",
    right: -8,
    top: -5,
  },
  basketBadgeText: {
    color: "#1f2933",
    fontSize: 11,
    fontWeight: "900",
  },
});
