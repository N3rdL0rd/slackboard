import { create } from "zustand";

/** What the tray was opened for: the climb to light (if any), and whether it is shown mirrored. */
export interface TrayContext { climbUuid?: string; mirror?: boolean }

interface TrayState {
  open: boolean;
  context: TrayContext;
  show: (context?: TrayContext) => void;
  hide: () => void;
}

/** The Bluetooth tray is one component at the root; any screen opens it from here. */
export const useBluetoothTray = create<TrayState>((set) => ({
  open: false,
  context: {},
  show: (context = {}) => set({ open: true, context }),
  hide: () => set({ open: false }),
}));

export const showBluetooth = (context?: TrayContext) => useBluetoothTray.getState().show(context);
