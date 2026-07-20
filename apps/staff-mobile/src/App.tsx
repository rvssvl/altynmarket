import {
  createAuthClient,
  createStaffOperationsClient,
  type PickingTaskAssignment,
} from "@altyn-market/client";
import type {
  AuthSession,
  DeliveryTask,
  DeliveryTaskStatus,
  Money,
  Order,
  OrderItem,
} from "@altyn-market/domain";
import { RegistryProvider, useAtom } from "@effect/atom-react";
import * as Atom from "effect/unstable/reactivity/Atom";
import { StatusBar } from "expo-status-bar";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://api-staging.altyn-market.kz";
const authClient = createAuthClient(apiBaseUrl);

type AuthStep = "phone" | "code";
type BackendState = "checking" | "online" | "offline";
type RoleMode = "picker" | "courier";
type QueueStatus = "idle" | "loading" | "refreshing";
type CancelReason = "unavailable" | "bad_quality";
type DeliveryActionStatus = Extract<
  DeliveryTaskStatus,
  "pickup_started" | "picked_up" | "delivering" | "delivered"
>;

const staffSessionAtom = Atom.make<AuthSession | undefined>(undefined);
const staffBackendStateAtom = Atom.make<BackendState>("checking");

interface QueueSnapshot {
  readonly pickingTasks: readonly PickingTaskAssignment[];
  readonly deliveryTasks: readonly DeliveryTask[];
  readonly ordersById: Readonly<Record<string, Order>>;
}

const emptyQueueSnapshot: QueueSnapshot = {
  deliveryTasks: [],
  ordersById: {},
  pickingTasks: [],
};

export default function App() {
  return (
    <RegistryProvider>
      <StaffApp />
    </RegistryProvider>
  );
}

function StaffApp() {
  const [phone, setPhone] = useState("+7 ");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [authStep, setAuthStep] = useState<AuthStep>("phone");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>();
  const [session, setSession] = useAtom(staffSessionAtom);
  const [roleMode, setRoleMode] = useState<RoleMode>("picker");
  const [backendState, setBackendState] = useAtom(staffBackendStateAtom);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>("idle");
  const [queue, setQueue] = useState<QueueSnapshot>(emptyQueueSnapshot);
  const [selectedPickingTaskId, setSelectedPickingTaskId] = useState<
    string | undefined
  >();
  const [selectedDeliveryTaskId, setSelectedDeliveryTaskId] = useState<
    string | undefined
  >();
  const [busyAction, setBusyAction] = useState<string | undefined>();
  const [notice, setNotice] = useState("Sign in with a staff phone number.");
  const [error, setError] = useState<string | undefined>();
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>();
  const [cancelReasonByItem, setCancelReasonByItem] = useState<
    Record<string, CancelReason>
  >({});

  const initializedAlertModesRef = useRef<Set<RoleMode>>(new Set());
  const seenPickingTaskIdsRef = useRef<Set<string>>(new Set());
  const seenDeliveryTaskIdsRef = useRef<Set<string>>(new Set());

  const staffClient = useMemo(
    () => createStaffOperationsClient(apiBaseUrl, () => session?.accessToken),
    [session?.accessToken],
  );

  const staffRoles = session?.staff?.roles ?? [];
  const canPick = staffRoles.includes("picker") || staffRoles.includes("admin");
  const canDeliver =
    staffRoles.includes("courier") || staffRoles.includes("admin");
  const hasStaffAccess = Boolean(session?.staff && (canPick || canDeliver));

  const selectedPickingTask = useMemo(
    () =>
      queue.pickingTasks.find((task) => task.id === selectedPickingTaskId) ??
      queue.pickingTasks[0],
    [queue.pickingTasks, selectedPickingTaskId],
  );
  const selectedPickingOrder = selectedPickingTask
    ? queue.ordersById[String(selectedPickingTask.orderId)]
    : undefined;

  const selectedDeliveryTask = useMemo(
    () =>
      queue.deliveryTasks.find((task) => task.id === selectedDeliveryTaskId) ??
      queue.deliveryTasks[0],
    [queue.deliveryTasks, selectedDeliveryTaskId],
  );
  const selectedDeliveryOrder = selectedDeliveryTask
    ? queue.ordersById[String(selectedDeliveryTask.orderId)]
    : undefined;

  const refreshQueues = useCallback(
    async (options: { readonly silent?: boolean } = {}) => {
      if (!session?.accessToken || !hasStaffAccess) {
        return;
      }

      setQueueStatus((current) =>
        current === "idle"
          ? lastSyncAt || options.silent
            ? "refreshing"
            : "loading"
          : current,
      );
      setError(undefined);

      try {
        if (roleMode === "picker") {
          const tasks = await staffClient.listPickingTasks();
          const ordersById = await loadOrdersForTasks(
            tasks.map((task) => String(task.orderId)),
            staffClient.getOrder,
          );

          setQueue((current) => ({
            ...current,
            ordersById: { ...current.ordersById, ...ordersById },
            pickingTasks: tasks,
          }));
          setSelectedPickingTaskId((current) =>
            current && tasks.some((task) => task.id === current)
              ? current
              : tasks[0]?.id,
          );
          notifyNewTasks("picker", tasks, seenPickingTaskIdsRef);
          setNotice(
            tasks.length > 0
              ? `${tasks.length} picking task${tasks.length === 1 ? "" : "s"} synced.`
              : "No assigned picking tasks right now.",
          );
        } else {
          const tasks = await staffClient.listDeliveryTasks();
          const ordersById = await loadOrdersForTasks(
            tasks.map((task) => String(task.orderId)),
            staffClient.getOrder,
          );

          setQueue((current) => ({
            ...current,
            deliveryTasks: tasks,
            ordersById: { ...current.ordersById, ...ordersById },
          }));
          setSelectedDeliveryTaskId((current) =>
            current && tasks.some((task) => task.id === current)
              ? current
              : tasks[0]?.id,
          );
          notifyNewTasks("courier", tasks, seenDeliveryTaskIdsRef);
          setNotice(
            tasks.length > 0
              ? `${tasks.length} delivery task${tasks.length === 1 ? "" : "s"} synced.`
              : "No assigned delivery tasks right now.",
          );
        }

        setBackendState("online");
        setLastSyncAt(new Date().toISOString());
      } catch (nextError) {
        setBackendState("offline");
        setError(formatError(nextError, "Could not sync staff queue."));
        setNotice(
          lastSyncAt
            ? "Offline. Showing the last synced tasks."
            : "Could not load assignments yet.",
        );
      } finally {
        setQueueStatus("idle");
      }
    },
    [hasStaffAccess, lastSyncAt, roleMode, session?.accessToken, staffClient],
  );

  useEffect(() => {
    void checkBackend();
  }, []);

  useEffect(() => {
    if (!session?.staff) {
      return;
    }

    if (canPick) {
      setRoleMode("picker");
      return;
    }

    if (canDeliver) {
      setRoleMode("courier");
    }
  }, [canDeliver, canPick, session?.staff]);

  useEffect(() => {
    if (!session?.accessToken || !hasStaffAccess) {
      return;
    }

    void refreshQueues();
    const interval = setInterval(
      () => void refreshQueues({ silent: true }),
      5_000,
    );
    return () => clearInterval(interval);
  }, [hasStaffAccess, refreshQueues, session?.accessToken]);

  async function checkBackend() {
    setBackendState("checking");

    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      setBackendState(response.ok ? "online" : "offline");
    } catch {
      setBackendState("offline");
    }
  }

  function notifyNewTasks(
    mode: RoleMode,
    tasks: readonly { readonly id: string; readonly orderId: string }[],
    seenTaskIdsRef: MutableRefObject<Set<string>>,
  ) {
    const previousIds = seenTaskIdsRef.current;
    const nextIds = new Set(tasks.map((task) => task.id));
    const newTasks = tasks.filter((task) => !previousIds.has(task.id));
    const hasSeenMode = initializedAlertModesRef.current.has(mode);

    seenTaskIdsRef.current = nextIds;
    initializedAlertModesRef.current.add(mode);

    if (!hasSeenMode || newTasks.length === 0) {
      return;
    }

    const title = mode === "picker" ? "New picking task" : "New delivery task";
    const message =
      newTasks.length === 1
        ? `Order ${shortId(String(newTasks[0]?.orderId))} was assigned.`
        : `${newTasks.length} new ${mode} tasks were assigned.`;

    setNotice(message);
    Alert.alert(title, message);
  }

  async function requestOtp() {
    setAuthBusy(true);
    setAuthError(undefined);

    try {
      const normalizedPhone = normalizePhone(phone);
      const result = await authClient.requestOtp(normalizedPhone);
      setDevCode(result.devCode);
      setCode(result.devCode ?? "");
      setAuthStep("code");
      setNotice("OTP sent. Enter the code to continue.");
    } catch (nextError) {
      setAuthError(formatError(nextError, "Could not send OTP."));
    } finally {
      setAuthBusy(false);
    }
  }

  async function verifyOtp() {
    setAuthBusy(true);
    setAuthError(undefined);

    try {
      const nextSession = await authClient.verifyOtp({
        code: code.trim(),
        deviceName: "Altyn Market Staff App",
        phone: normalizePhone(phone),
      });

      setSession(nextSession);
      setNotice(
        nextSession.staff
          ? `Signed in as ${nextSession.staff.displayName}.`
          : "This phone number does not have staff access.",
      );
      setError(undefined);
    } catch (nextError) {
      setAuthError(formatError(nextError, "Could not verify OTP."));
    } finally {
      setAuthBusy(false);
    }
  }

  async function refreshStaffAccess() {
    if (!session) {
      return;
    }

    setAuthBusy(true);
    setError(undefined);

    try {
      const nextSession = await authClient.getCurrentSession(
        session.accessToken,
      );
      setSession(nextSession);
      setBackendState("online");
      setNotice(
        nextSession.staff
          ? `Access updated for ${nextSession.staff.displayName}.`
          : "Access is not assigned to this phone number yet.",
      );
    } catch (nextError) {
      setBackendState("offline");
      setError(formatError(nextError, "Could not refresh staff access."));
    } finally {
      setAuthBusy(false);
    }
  }

  function logout() {
    setSession(undefined);
    setQueue(emptyQueueSnapshot);
    setSelectedPickingTaskId(undefined);
    setSelectedDeliveryTaskId(undefined);
    setLastSyncAt(undefined);
    setError(undefined);
    setNotice("Signed out.");
    initializedAlertModesRef.current = new Set();
    seenPickingTaskIdsRef.current = new Set();
    seenDeliveryTaskIdsRef.current = new Set();
  }

  async function runAction<T>(
    actionId: string,
    action: () => Promise<T>,
    onSuccess: (result: T) => void,
    successNotice: (result: T) => string,
  ) {
    setBusyAction(actionId);
    setError(undefined);

    try {
      const result = await action();
      onSuccess(result);
      setNotice(successNotice(result));
      setBackendState("online");
      setLastSyncAt(new Date().toISOString());
      void refreshQueues({ silent: true });
    } catch (nextError) {
      setBackendState("offline");
      setError(formatError(nextError, "Action failed."));
    } finally {
      setBusyAction(undefined);
    }
  }

  function updateOrderInQueue(order: Order) {
    setQueue((current) => ({
      ...current,
      ordersById: { ...current.ordersById, [String(order.id)]: order },
    }));
  }

  function updateDeliveryTaskInQueue(task: DeliveryTask) {
    setQueue((current) => ({
      ...current,
      deliveryTasks: current.deliveryTasks.map((currentTask) =>
        currentTask.id === task.id ? task : currentTask,
      ),
    }));
  }

  function startPicking(order: Order) {
    void runAction(
      `start-${order.id}`,
      () => staffClient.startPicking(String(order.id)),
      updateOrderInQueue,
      () => `Started picking order ${shortId(String(order.id))}.`,
    );
  }

  function markItemPicked(order: Order, item: OrderItem) {
    void runAction(
      `picked-${item.id}`,
      () =>
        staffClient.updatePickingItem({
          itemId: String(item.id),
          orderId: String(order.id),
          pickedQuantity: item.requestedQuantity,
          status: "picked",
        }),
      updateOrderInQueue,
      () => `${item.productNameSnapshot} confirmed.`,
    );
  }

  function cancelItem(order: Order, item: OrderItem) {
    const reason = cancelReasonByItem[String(item.id)] ?? "unavailable";

    void runAction(
      `cancel-${item.id}`,
      () =>
        staffClient.updatePickingItem({
          itemId: String(item.id),
          orderId: String(order.id),
          reason,
          status: "cancelled",
        }),
      updateOrderInQueue,
      () =>
        `${item.productNameSnapshot} cancelled: ${cancelReasonLabels[reason]}.`,
    );
  }

  function completePicking(order: Order) {
    void runAction(
      `complete-${order.id}`,
      () => staffClient.completePicking(String(order.id)),
      updateOrderInQueue,
      () => `Picking completed for order ${shortId(String(order.id))}.`,
    );
  }

  function updateDeliveryStatus(
    task: DeliveryTask,
    status: DeliveryActionStatus,
  ) {
    void runAction(
      `delivery-${task.id}-${status}`,
      () =>
        staffClient.updateDeliveryStatus({
          orderId: String(task.orderId),
          status,
        }),
      updateDeliveryTaskInQueue,
      () => `Delivery moved to ${deliveryStatusLabels[status]}.`,
    );
  }

  const appTitle = roleMode === "picker" ? "Picking Tasks" : "Delivery Queue";

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <Text style={styles.kicker}>Staff app</Text>
            <Text style={styles.title}>
              {session ? appTitle : "Staff Login"}
            </Text>
          </View>
          {session ? (
            <Pressable style={styles.outlineButton} onPress={logout}>
              <Text style={styles.outlineText}>Sign out</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.outlineButton} onPress={checkBackend}>
              <Text style={styles.outlineText}>Check</Text>
            </Pressable>
          )}
        </View>

        <StatusBanner
          backendState={backendState}
          error={session ? error : authError}
          lastSyncAt={lastSyncAt}
          notice={notice}
          queueStatus={queueStatus}
        />

        {!session ? (
          <LoginPanel
            authBusy={authBusy}
            authStep={authStep}
            code={code}
            devCode={devCode}
            onCodeChange={setCode}
            onPhoneChange={setPhone}
            onRequestOtp={requestOtp}
            onVerifyOtp={verifyOtp}
            phone={phone}
          />
        ) : !hasStaffAccess ? (
          <View style={styles.panel}>
            <Text style={styles.rowTitle}>No picker or courier role</Text>
            <Text style={styles.muted}>
              Ask an admin to assign a picker or courier profile to this phone
              number.
            </Text>
            <Pressable
              disabled={authBusy}
              style={[styles.secondaryButton, authBusy && styles.disabled]}
              onPress={() => void refreshStaffAccess()}
            >
              <Text style={styles.secondaryText}>
                {authBusy ? "Refreshing..." : "Refresh access"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <StaffSummary
              canDeliver={canDeliver}
              canPick={canPick}
              onRefresh={() => void refreshQueues()}
              onRoleModeChange={setRoleMode}
              queueStatus={queueStatus}
              roleMode={roleMode}
              session={session}
            />

            {roleMode === "picker" ? (
              <PickerMode
                busyAction={busyAction}
                cancelReasonByItem={cancelReasonByItem}
                onCancelItem={cancelItem}
                onCompletePicking={completePicking}
                onMarkItemPicked={markItemPicked}
                onReasonChange={(itemId, reason) =>
                  setCancelReasonByItem((current) => ({
                    ...current,
                    [itemId]: reason,
                  }))
                }
                onSelectTask={setSelectedPickingTaskId}
                onStartPicking={startPicking}
                order={selectedPickingOrder}
                selectedTask={selectedPickingTask}
                tasks={queue.pickingTasks}
              />
            ) : (
              <CourierMode
                busyAction={busyAction}
                onSelectTask={setSelectedDeliveryTaskId}
                onUpdateStatus={updateDeliveryStatus}
                order={selectedDeliveryOrder}
                selectedTask={selectedDeliveryTask}
                tasks={queue.deliveryTasks}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function LoginPanel({
  authBusy,
  authStep,
  code,
  devCode,
  onCodeChange,
  onPhoneChange,
  onRequestOtp,
  onVerifyOtp,
  phone,
}: {
  readonly authBusy: boolean;
  readonly authStep: AuthStep;
  readonly code: string;
  readonly devCode: string | undefined;
  readonly onCodeChange: (value: string) => void;
  readonly onPhoneChange: (value: string) => void;
  readonly onRequestOtp: () => void;
  readonly onVerifyOtp: () => void;
  readonly phone: string;
}) {
  return (
    <View style={styles.panel}>
      <Text style={styles.sectionLabel}>Phone</Text>
      <TextInput
        autoComplete="tel"
        editable={!authBusy}
        keyboardType="phone-pad"
        onChangeText={onPhoneChange}
        placeholder="+7 701 000 00 00"
        style={styles.input}
        value={phone}
      />

      {authStep === "code" ? (
        <>
          <View style={styles.codeHeader}>
            <Text style={styles.sectionLabel}>OTP code</Text>
            {devCode ? (
              <Text style={styles.devCode}>Dev code {devCode}</Text>
            ) : null}
          </View>
          <TextInput
            editable={!authBusy}
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={onCodeChange}
            placeholder="111111"
            style={styles.input}
            value={code}
          />
        </>
      ) : null}

      <Pressable
        disabled={authBusy}
        style={[styles.primaryButton, authBusy && styles.disabled]}
        onPress={authStep === "phone" ? onRequestOtp : onVerifyOtp}
      >
        <Text style={styles.primaryText}>
          {authBusy
            ? "Working..."
            : authStep === "phone"
              ? "Send OTP"
              : "Sign in"}
        </Text>
      </Pressable>
    </View>
  );
}

function StatusBanner({
  backendState,
  error,
  lastSyncAt,
  notice,
  queueStatus,
}: {
  readonly backendState: BackendState;
  readonly error: string | undefined;
  readonly lastSyncAt: string | undefined;
  readonly notice: string;
  readonly queueStatus: QueueStatus;
}) {
  return (
    <View style={styles.banner}>
      <View style={styles.bannerTop}>
        <Text style={styles.notice}>{notice}</Text>
        <Text
          style={[
            styles.connectionPill,
            backendState === "offline" && styles.connectionOffline,
          ]}
        >
          {backendState === "checking"
            ? "Checking"
            : backendState === "online"
              ? "Online"
              : "Offline"}
        </Text>
      </View>
      {queueStatus !== "idle" ? (
        <Text style={styles.muted}>
          {queueStatus === "loading"
            ? "Loading assignments..."
            : "Refreshing..."}
        </Text>
      ) : lastSyncAt ? (
        <Text style={styles.muted}>Last sync {formatTime(lastSyncAt)}</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function StaffSummary({
  canDeliver,
  canPick,
  onRefresh,
  onRoleModeChange,
  queueStatus,
  roleMode,
  session,
}: {
  readonly canDeliver: boolean;
  readonly canPick: boolean;
  readonly onRefresh: () => void;
  readonly onRoleModeChange: (mode: RoleMode) => void;
  readonly queueStatus: QueueStatus;
  readonly roleMode: RoleMode;
  readonly session: AuthSession;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.detailHeader}>
        <View style={styles.headerTitle}>
          <Text style={styles.kicker}>Signed in</Text>
          <Text style={styles.orderTitle}>
            {session.staff?.displayName ?? session.customer.phone.e164}
          </Text>
          <Text style={styles.muted}>
            {formatRoles(session.staff?.roles ?? [])}
          </Text>
        </View>
        <Pressable
          disabled={queueStatus !== "idle"}
          style={[
            styles.refreshButton,
            queueStatus !== "idle" && styles.disabled,
          ]}
          onPress={onRefresh}
        >
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {canPick && canDeliver ? (
        <View style={styles.segmented}>
          <RoleButton
            active={roleMode === "picker"}
            label="Picker"
            onPress={() => onRoleModeChange("picker")}
          />
          <RoleButton
            active={roleMode === "courier"}
            label="Courier"
            onPress={() => onRoleModeChange("courier")}
          />
        </View>
      ) : null}
    </View>
  );
}

function RoleButton({
  active,
  label,
  onPress,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.segmentButton, active && styles.segmentButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function PickerMode({
  busyAction,
  cancelReasonByItem,
  onCancelItem,
  onCompletePicking,
  onMarkItemPicked,
  onReasonChange,
  onSelectTask,
  onStartPicking,
  order,
  selectedTask,
  tasks,
}: {
  readonly busyAction: string | undefined;
  readonly cancelReasonByItem: Readonly<Record<string, CancelReason>>;
  readonly onCancelItem: (order: Order, item: OrderItem) => void;
  readonly onCompletePicking: (order: Order) => void;
  readonly onMarkItemPicked: (order: Order, item: OrderItem) => void;
  readonly onReasonChange: (itemId: string, reason: CancelReason) => void;
  readonly onSelectTask: (taskId: string) => void;
  readonly onStartPicking: (order: Order) => void;
  readonly order: Order | undefined;
  readonly selectedTask: PickingTaskAssignment | undefined;
  readonly tasks: readonly PickingTaskAssignment[];
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="No picking tasks"
        body="Assigned orders will appear here."
      />
    );
  }

  return (
    <>
      <TaskList
        activeTaskId={selectedTask?.id}
        emptyLabel="No assigned picking tasks."
        getSubtitle={(task) =>
          pickingTaskStatusLabels[task.status] ?? task.status
        }
        onSelectTask={onSelectTask}
        tasks={tasks}
      />

      {selectedTask && order ? (
        <View style={styles.panel}>
          <View style={styles.detailHeader}>
            <View style={styles.headerTitle}>
              <Text style={styles.kicker}>Selected order</Text>
              <Text style={styles.orderTitle}>{shortId(String(order.id))}</Text>
              <Text style={styles.muted}>
                {formatOrderStatus(order.status)}
              </Text>
            </View>
            <Text style={styles.totalText}>
              {formatMoney(order.finalTotal)}
            </Text>
          </View>

          <View style={styles.infoGrid}>
            <InfoTile
              label="Task"
              value={
                pickingTaskStatusLabels[selectedTask.status] ??
                selectedTask.status
              }
            />
            <InfoTile
              label="Payment"
              value={order.paymentId ? "Payment linked" : "No payment"}
            />
            <InfoTile label="Items" value={`${order.items.length}`} />
          </View>

          <View style={styles.actionRow}>
            <Pressable
              disabled={
                Boolean(busyAction) || selectedTask.status === "completed"
              }
              style={[
                styles.primaryButton,
                (Boolean(busyAction) || selectedTask.status === "completed") &&
                  styles.disabled,
              ]}
              onPress={() => onStartPicking(order)}
            >
              <Text style={styles.primaryText}>
                {busyAction === `start-${order.id}` ? "Starting..." : "Start"}
              </Text>
            </Pressable>
            <Pressable
              disabled={
                Boolean(busyAction) || selectedTask.status === "completed"
              }
              style={[
                styles.primaryButton,
                (Boolean(busyAction) || selectedTask.status === "completed") &&
                  styles.disabled,
              ]}
              onPress={() => onCompletePicking(order)}
            >
              <Text style={styles.primaryText}>
                {busyAction === `complete-${order.id}`
                  ? "Saving..."
                  : "Complete"}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Items</Text>
          {order.items.map((item) => (
            <PickerItem
              busyAction={busyAction}
              item={item}
              key={item.id}
              onCancel={() => onCancelItem(order, item)}
              onMarkPicked={() => onMarkItemPicked(order, item)}
              onReasonChange={(reason) =>
                onReasonChange(String(item.id), reason)
              }
              reason={cancelReasonByItem[String(item.id)] ?? "unavailable"}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          title="Order details unavailable"
          body="Reconnect and refresh to load this assigned order."
        />
      )}
    </>
  );
}

function PickerItem({
  busyAction,
  item,
  onCancel,
  onMarkPicked,
  onReasonChange,
  reason,
}: {
  readonly busyAction: string | undefined;
  readonly item: OrderItem;
  readonly onCancel: () => void;
  readonly onMarkPicked: () => void;
  readonly onReasonChange: (reason: CancelReason) => void;
  readonly reason: CancelReason;
}) {
  const isFinal = item.status === "picked" || item.status === "cancelled";
  const isBusy =
    busyAction === `picked-${item.id}` || busyAction === `cancel-${item.id}`;

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemTop}>
        <View style={styles.itemMain}>
          <Text style={styles.rowTitle}>{item.productNameSnapshot}</Text>
          <Text style={styles.muted}>
            {item.requestedQuantity} {item.unitSnapshot} x{" "}
            {formatMoney(item.unitPriceSnapshot)}
          </Text>
          {item.pickedQuantity !== undefined ? (
            <Text style={styles.muted}>
              Picked {item.pickedQuantity} {item.unitSnapshot}
            </Text>
          ) : null}
          {item.cancellationReason ? (
            <Text style={styles.cancelReason}>
              Reason: {cancelReasonLabels[item.cancellationReason]}
            </Text>
          ) : null}
        </View>
        <View style={styles.itemStatusPill}>
          <Text style={styles.itemStatusText}>
            {itemStatusLabels[item.status]}
          </Text>
        </View>
      </View>

      <View style={styles.itemActions}>
        <Pressable
          disabled={Boolean(busyAction) || isFinal}
          style={[
            styles.secondaryButton,
            (Boolean(busyAction) || isFinal) && styles.disabled,
          ]}
          onPress={onMarkPicked}
        >
          <Text style={styles.secondaryText}>
            {busyAction === `picked-${item.id}` ? "Saving..." : "Confirm"}
          </Text>
        </Pressable>
        <Pressable
          disabled={Boolean(busyAction) || isFinal}
          style={[
            styles.dangerButton,
            (Boolean(busyAction) || isFinal) && styles.disabled,
          ]}
          onPress={onCancel}
        >
          <Text style={styles.dangerText}>
            {busyAction === `cancel-${item.id}` ? "Saving..." : "Cancel"}
          </Text>
        </Pressable>
      </View>

      {!isFinal ? (
        <View style={styles.reasonRow}>
          <ReasonButton
            active={reason === "unavailable"}
            label="Unavailable"
            onPress={() => onReasonChange("unavailable")}
          />
          <ReasonButton
            active={reason === "bad_quality"}
            label="Bad quality"
            onPress={() => onReasonChange("bad_quality")}
          />
        </View>
      ) : null}

      {isBusy ? (
        <Text style={styles.inlineLoading}>Updating item...</Text>
      ) : null}
    </View>
  );
}

function ReasonButton({
  active,
  label,
  onPress,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.reasonButton, active && styles.reasonButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.reasonText, active && styles.reasonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function CourierMode({
  busyAction,
  onSelectTask,
  onUpdateStatus,
  order,
  selectedTask,
  tasks,
}: {
  readonly busyAction: string | undefined;
  readonly onSelectTask: (taskId: string) => void;
  readonly onUpdateStatus: (
    task: DeliveryTask,
    status: DeliveryActionStatus,
  ) => void;
  readonly order: Order | undefined;
  readonly selectedTask: DeliveryTask | undefined;
  readonly tasks: readonly DeliveryTask[];
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="No deliveries"
        body="Assigned deliveries will appear here."
      />
    );
  }

  return (
    <>
      <TaskList
        activeTaskId={selectedTask?.id}
        emptyLabel="No delivery tasks."
        getSubtitle={(task) => deliveryStatusLabels[task.status] ?? task.status}
        onSelectTask={onSelectTask}
        tasks={tasks}
      />

      {selectedTask ? (
        <View style={styles.panel}>
          <View style={styles.detailHeader}>
            <View style={styles.headerTitle}>
              <Text style={styles.kicker}>Delivery task</Text>
              <Text style={styles.orderTitle}>
                {shortId(String(selectedTask.orderId))}
              </Text>
              <Text style={styles.muted}>
                {deliveryStatusLabels[selectedTask.status] ??
                  selectedTask.status}
              </Text>
            </View>
            {order ? (
              <Text style={styles.totalText}>
                {formatMoney(order.finalTotal)}
              </Text>
            ) : null}
          </View>

          {order ? (
            <View style={styles.infoGrid}>
              <InfoTile label="Order" value={formatOrderStatus(order.status)} />
              <InfoTile
                label="Address"
                value={shortId(String(order.addressId))}
              />
              <InfoTile label="Items" value={`${order.items.length}`} />
            </View>
          ) : (
            <Text style={styles.warningText}>
              Order details are not loaded. Refresh when online.
            </Text>
          )}

          <Text style={styles.sectionLabel}>Delivery states</Text>
          <View style={styles.deliveryActions}>
            {deliveryActions.map((action) => (
              <Pressable
                disabled={
                  Boolean(busyAction) ||
                  selectedTask.status === "delivered" ||
                  selectedTask.status === action.status
                }
                key={action.status}
                style={[
                  styles.deliveryButton,
                  selectedTask.status === action.status &&
                    styles.deliveryButtonActive,
                  (Boolean(busyAction) ||
                    selectedTask.status === "delivered" ||
                    selectedTask.status === action.status) &&
                    styles.disabled,
                ]}
                onPress={() => onUpdateStatus(selectedTask, action.status)}
              >
                <Text style={styles.deliveryText}>
                  {busyAction === `delivery-${selectedTask.id}-${action.status}`
                    ? "Saving..."
                    : action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

function TaskList<
  TTask extends { readonly id: string; readonly orderId: string },
>({
  activeTaskId,
  emptyLabel,
  getSubtitle,
  onSelectTask,
  tasks,
}: {
  readonly activeTaskId: string | undefined;
  readonly emptyLabel: string;
  readonly getSubtitle: (task: TTask) => string;
  readonly onSelectTask: (taskId: string) => void;
  readonly tasks: readonly TTask[];
}) {
  return (
    <View style={styles.queue}>
      {tasks.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.muted}>{emptyLabel}</Text>
        </View>
      ) : (
        tasks.map((task) => (
          <Pressable
            key={task.id}
            style={[
              styles.queueCard,
              activeTaskId === task.id && styles.queueCardActive,
            ]}
            onPress={() => onSelectTask(task.id)}
          >
            <View style={styles.headerTitle}>
              <Text style={styles.rowTitle}>
                {shortId(String(task.orderId))}
              </Text>
              <Text style={styles.muted}>Task {shortId(task.id)}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{getSubtitle(task)}</Text>
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}

function InfoTile({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.infoTile}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function EmptyState({
  body,
  title,
}: {
  readonly body: string;
  readonly title: string;
}) {
  return (
    <View style={styles.emptyBox}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.muted}>{body}</Text>
    </View>
  );
}

const loadOrdersForTasks = async (
  orderIds: readonly string[],
  getOrder: (orderId: string) => Promise<Order>,
): Promise<Record<string, Order>> => {
  const uniqueOrderIds = [...new Set(orderIds)];
  const entries = await Promise.all(
    uniqueOrderIds.map(
      async (orderId) => [orderId, await getOrder(orderId)] as const,
    ),
  );

  return Object.fromEntries(entries);
};

const normalizePhone = (value: string): string => {
  const trimmed = value.trim().replace(/[^\d+]/g, "");

  if (trimmed.startsWith("+")) {
    return trimmed;
  }

  if (trimmed.startsWith("8")) {
    return `+7${trimmed.slice(1)}`;
  }

  if (trimmed.startsWith("7")) {
    return `+${trimmed}`;
  }

  return trimmed;
};

const formatError = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : fallback;
  return /fetch failed|network request failed|hostname could not be found/i.test(
    message,
  )
    ? "Could not reach Altyn Market. Check your connection and try again."
    : message;
};

const formatMoney = (money: Money): string =>
  `${new Intl.NumberFormat("ru-KZ").format(money.amountMinor / 100)} ${money.currency}`;

const formatTime = (value: string): string =>
  new Date(value).toLocaleTimeString("ru-KZ", {
    hour: "2-digit",
    minute: "2-digit",
  });

const shortId = (value: string): string =>
  value.length > 10 ? `${value.slice(0, 4)}...${value.slice(-4)}` : value;

const humanize = (value: string): string =>
  value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");

const formatRoles = (roles: readonly string[]): string =>
  roles.length > 0 ? roles.map(humanize).join(", ") : "Staff";

const formatOrderStatus = (status: string): string =>
  orderStatusLabels[status] ?? humanize(status);

const itemStatusLabels: Record<OrderItem["status"], string> = {
  cancelled: "Cancelled",
  pending: "Pending",
  picked: "Picked",
};

const cancelReasonLabels: Record<
  CancelReason | "customer_request" | "admin_request",
  string
> = {
  admin_request: "Admin request",
  bad_quality: "Bad quality",
  customer_request: "Customer request",
  unavailable: "Unavailable",
};

const pickingTaskStatusLabels: Record<string, string> = {
  assigned: "Assigned",
  cancelled: "Cancelled",
  completed: "Completed",
  in_progress: "In progress",
};

const deliveryStatusLabels: Record<string, string> = {
  assigned: "Assigned",
  cancelled: "Cancelled",
  delivered: "Delivered",
  delivering: "On the way",
  picked_up: "Picked up",
  pickup_started: "Pickup",
};

const orderStatusLabels: Record<string, string> = {
  awaiting_courier: "Awaiting courier",
  awaiting_picking: "Awaiting picking",
  cancelled: "Cancelled",
  delivered: "Delivered",
  delivering: "Delivering",
  draft: "Draft",
  payment_authorized: "Payment authorized",
  payment_captured: "Payment captured",
  payment_failed: "Payment failed",
  picked: "Picked",
  picking: "Picking",
  refund_required: "Refund required",
  refunded: "Refunded",
};

const deliveryActions: readonly {
  readonly label: string;
  readonly status: DeliveryActionStatus;
}[] = [
  { label: "Pickup", status: "pickup_started" },
  { label: "Picked up", status: "picked_up" },
  { label: "On way", status: "delivering" },
  { label: "Delivered", status: "delivered" },
];

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  banner: {
    backgroundColor: "#eef4f1",
    borderColor: "#cddbd4",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12,
  },
  bannerTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  cancelReason: {
    color: "#8b3826",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  codeHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  connectionOffline: {
    backgroundColor: "#f7e3db",
    color: "#8b3826",
  },
  connectionPill: {
    backgroundColor: "#dfeee0",
    borderRadius: 999,
    color: "#315f29",
    flexShrink: 0,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  container: {
    padding: 20,
    paddingBottom: 36,
  },
  dangerButton: {
    alignItems: "center",
    borderColor: "#c78d7b",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  dangerText: {
    color: "#8b3826",
    fontWeight: "800",
  },
  deliveryActions: {
    gap: 10,
  },
  deliveryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#cddbd4",
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 12,
  },
  deliveryButtonActive: {
    backgroundColor: "#dfeee0",
    borderColor: "#315f29",
  },
  deliveryText: {
    color: "#24342b",
    fontWeight: "800",
  },
  detailHeader: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  devCode: {
    color: "#315f29",
    fontSize: 12,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.55,
  },
  emptyBox: {
    backgroundColor: "#fffdf8",
    borderColor: "#ded7ca",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  error: {
    color: "#8b3826",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 6,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  infoLabel: {
    color: "#64705f",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  infoTile: {
    backgroundColor: "#f5f7f2",
    borderColor: "#dce3d7",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "30%",
    flexGrow: 1,
    minWidth: 96,
    padding: 10,
  },
  infoValue: {
    color: "#1b1f1c",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 3,
  },
  inlineLoading: {
    color: "#315f29",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
  },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#cdd7ca",
    borderRadius: 8,
    borderWidth: 1,
    color: "#1b1f1c",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  itemActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  itemCard: {
    borderBottomColor: "#eee6d8",
    borderBottomWidth: 1,
    paddingVertical: 13,
  },
  itemMain: {
    flex: 1,
    minWidth: 0,
  },
  itemStatusPill: {
    backgroundColor: "#f7f4ed",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  itemStatusText: {
    color: "#596057",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  itemTop: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  kicker: {
    color: "#64705f",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  muted: {
    color: "#596057",
    fontSize: 15,
    lineHeight: 21,
  },
  notice: {
    color: "#315f29",
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  orderTitle: {
    color: "#1b1f1c",
    fontSize: 22,
    fontWeight: "800",
  },
  outlineButton: {
    borderColor: "#88a272",
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  outlineText: {
    color: "#315f29",
    fontWeight: "800",
  },
  panel: {
    backgroundColor: "#fffdf8",
    borderColor: "#ded7ca",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 16,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#315f29",
    borderRadius: 8,
    flex: 1,
    paddingVertical: 12,
  },
  primaryText: {
    color: "#ffffff",
    fontWeight: "800",
  },
  queue: {
    gap: 10,
    marginBottom: 14,
  },
  queueCard: {
    alignItems: "center",
    backgroundColor: "#fffdf8",
    borderColor: "#ded7ca",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    padding: 14,
  },
  queueCardActive: {
    borderColor: "#315f29",
    borderWidth: 2,
  },
  reasonButton: {
    borderColor: "#d9d1c1",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  reasonButtonActive: {
    backgroundColor: "#fff2ee",
    borderColor: "#c78d7b",
  },
  reasonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  reasonText: {
    color: "#596057",
    fontSize: 12,
    fontWeight: "800",
  },
  reasonTextActive: {
    color: "#8b3826",
  },
  refreshButton: {
    borderColor: "#88a272",
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  refreshText: {
    color: "#315f29",
    fontWeight: "800",
  },
  rowTitle: {
    color: "#1b1f1c",
    fontSize: 17,
    fontWeight: "800",
  },
  safe: {
    backgroundColor: "#f7f4ed",
    flex: 1,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#d9d1c1",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  secondaryText: {
    color: "#315f29",
    fontWeight: "800",
  },
  sectionLabel: {
    color: "#1b1f1c",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 14,
    textTransform: "uppercase",
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    paddingVertical: 10,
  },
  segmentButtonActive: {
    backgroundColor: "#315f29",
  },
  segmentText: {
    color: "#315f29",
    fontWeight: "800",
  },
  segmentTextActive: {
    color: "#ffffff",
  },
  segmented: {
    backgroundColor: "#eef4e7",
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    marginTop: 14,
    padding: 4,
  },
  statusPill: {
    backgroundColor: "#eef4e7",
    borderRadius: 999,
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    color: "#315f29",
    fontSize: 12,
    fontWeight: "800",
  },
  title: {
    color: "#1b1f1c",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 34,
  },
  totalText: {
    color: "#1b1f1c",
    flexShrink: 0,
    fontSize: 18,
    fontWeight: "800",
  },
  warningText: {
    color: "#8b6c26",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 14,
  },
});
