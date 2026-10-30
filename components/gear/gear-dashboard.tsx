"use client";

import { useState } from "react";
import {
  Layers,
  Package,
  ClipboardCheck,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Camera,
  Wrench,
  ShieldCheck,
  Check,
} from "lucide-react";
import { GearKpiSummary } from "./gear-kpi-summary";
import { GearItemDialog, type InventoryItemRow } from "./gear-item-dialog";
import { KitBundleDialog, type KitBundleRow } from "./kit-bundle-dialog";
import { KitBundleBomViewer } from "./kit-bundle-bom-viewer";
import {
  InspectionDialog,
  type ReservationWithDetails,
} from "./inspection-dialog";
import { deleteGearItem, deleteKitBundle, updateGearConditionStatus } from "@/lib/actions/gear";

interface GearDashboardProps {
  tenantId: string;
  tenantSlug: string;
  currency: string;
  initialItems: InventoryItemRow[];
  initialBundles: KitBundleRow[];
  initialReservations: ReservationWithDetails[];
}

export function GearDashboard({
  tenantId,
  tenantSlug,
  currency,
  initialItems,
  initialBundles,
  initialReservations,
}: GearDashboardProps) {
  const [activeTab, setActiveTab] = useState<"ITEMS" | "BUNDLES" | "RESERVATIONS">("ITEMS");

  // State
  const [items, setItems] = useState<InventoryItemRow[]>(initialItems);
  const [bundles, setBundles] = useState<KitBundleRow[]>(initialBundles);
  const [reservations, setReservations] = useState<ReservationWithDetails[]>(initialReservations);

  // Filters for Items
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Dialog States
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<InventoryItemRow | null>(null);

  const [isBundleDialogOpen, setIsBundleDialogOpen] = useState(false);
  const [bundleToEdit, setBundleToEdit] = useState<KitBundleRow | null>(null);

  const [inspectingBundle, setInspectingBundle] = useState<KitBundleRow | null>(null);

  const [inspectionReservation, setInspectionReservation] = useState<ReservationWithDetails | null>(null);
  const [inspectionMode, setInspectionMode] = useState<"PRE_SHOOT" | "POST_SHOOT">("PRE_SHOOT");
  const [isInspectionDialogOpen, setIsInspectionDialogOpen] = useState(false);

  // KPI calculations
  const totalItemsCount = items.length;
  const totalDailyValue = items.reduce((sum, item) => sum + (item.dailyRate || 0), 0);
  const onShootCount = items.filter((item) => item.status === "ON_SHOOT").length;
  const maintenanceCount = items.filter(
    (item) => item.status === "MAINTENANCE" || item.condition === "DAMAGED"
  ).length;

  // Filtered items
  const filteredItems = items.filter((item) => {
    if (categoryFilter !== "ALL" && item.category !== categoryFilter) return false;
    if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchSku = item.sku.toLowerCase().includes(q);
      const matchSerial = (item.serialNumber || "").toLowerCase().includes(q);
      if (!matchName && !matchSku && !matchSerial) return false;
    }
    return true;
  });

  const categories = Array.from(new Set(items.map((i) => i.category))).sort();

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Are you sure you want to delete this equipment item?")) return;
    const res = await deleteGearItem({ id, tenantId, tenantSlug });
    if (res.success) {
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      alert(res.message || "Failed to delete item.");
    }
  };

  const handleDeleteBundle = async (id: string) => {
    if (!confirm("Are you sure you want to delete this kit bundle?")) return;
    const res = await deleteKitBundle({ id, tenantId, tenantSlug });
    if (res.success) {
      setBundles((prev) => prev.filter((b) => b.id !== id));
    } else {
      alert(res.error || "Failed to delete bundle.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Layers className="size-6 text-amber-400" />
            <span>Gear Fleet & Kit BOM Studio Command</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Enterprise hardware fleet registry, modular bill of materials, and pre/post-shoot inspection logs
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "ITEMS" && (
            <button
              type="button"
              onClick={() => {
                setItemToEdit(null);
                setIsItemDialogOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Plus className="size-4" />
              <span>Add Equipment</span>
            </button>
          )}

          {activeTab === "BUNDLES" && (
            <button
              type="button"
              onClick={() => {
                setBundleToEdit(null);
                setIsBundleDialogOpen(true);
              }}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-mono font-bold flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
            >
              <Plus className="size-4" />
              <span>Create Kit Bundle</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Overview Metrics */}
      <GearKpiSummary
        totalItems={totalItemsCount}
        totalDailyValue={totalDailyValue}
        onShootCount={onShootCount}
        maintenanceCount={maintenanceCount}
        currency={currency}
      />

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-px text-xs font-mono font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("ITEMS")}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all cursor-pointer ${
            activeTab === "ITEMS"
              ? "border-amber-400 text-amber-400 font-bold bg-amber-500/5"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <Layers className="size-4" />
          <span>Equipment Fleet Registry ({items.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("BUNDLES")}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all cursor-pointer ${
            activeTab === "BUNDLES"
              ? "border-amber-400 text-amber-400 font-bold bg-amber-500/5"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <Package className="size-4" />
          <span>Kit Bundles & BOM ({bundles.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("RESERVATIONS")}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all cursor-pointer ${
            activeTab === "RESERVATIONS"
              ? "border-amber-400 text-amber-400 font-bold bg-amber-500/5"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <ClipboardCheck className="size-4" />
          <span>Shoot Reservations & Inspections ({reservations.length})</span>
        </button>
      </div>

      {/* TAB 1: EQUIPMENT FLEET REGISTRY */}
      {activeTab === "ITEMS" && (
        <div className="space-y-4">
          {/* Filters & Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-[#0d0d10] border border-zinc-800">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="size-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by asset name, SKU, or serial..."
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Category and Status Dropdowns */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="ON_SHOOT">ON_SHOOT</option>
                <option value="RESERVED">RESERVED</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-mono uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Asset / Equipment</th>
                    <th className="py-3 px-3">SKU & Serial</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Condition</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Daily Rate</th>
                    <th className="py-3 px-3">Vault Location</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-zinc-500 font-mono text-xs">
                        No equipment assets found matching your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const isAvail = item.status === "AVAILABLE";
                      const isOnShoot = item.status === "ON_SHOOT";
                      const isReserved = item.status === "RESERVED";
                      const isMaintenance = item.status === "MAINTENANCE";

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-zinc-900/50 transition-colors"
                        >
                          <td className="py-3.5 px-4 font-semibold text-white">
                            <div>{item.name}</div>
                            <div className="text-[10px] font-mono text-zinc-500">
                              {item.discipline}
                            </div>
                          </td>
                          <td className="py-3.5 px-3 font-mono text-zinc-300">
                            <span className="font-bold text-amber-400">{item.sku}</span>
                            {item.serialNumber && (
                              <div className="text-[10px] text-zinc-500">
                                S/N: {item.serialNumber}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-zinc-300 font-medium">
                            {item.category}
                          </td>
                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                                item.condition === "EXCELLENT"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : item.condition === "GOOD"
                                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                  : item.condition === "FAIR"
                                  ? "bg-zinc-800 text-zinc-400 border border-zinc-700"
                                  : "bg-red-500/10 text-red-400 border border-red-500/20"
                              }`}
                            >
                              {item.condition}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                                isAvail
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                  : isOnShoot
                                  ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                                  : isReserved
                                  ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              }`}
                            >
                              {isAvail ? (
                                <>
                                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  <span>AVAILABLE</span>
                                </>
                              ) : isOnShoot ? (
                                <>
                                  <Camera className="size-3" />
                                  <span>ON_SHOOT</span>
                                </>
                              ) : isReserved ? (
                                <>
                                  <Clock className="size-3" />
                                  <span>RESERVED</span>
                                </>
                              ) : (
                                <>
                                  <Wrench className="size-3" />
                                  <span>MAINTENANCE</span>
                                </>
                              )}
                            </span>
                          </td>
                          <td className="py-3.5 px-3 font-mono font-bold text-emerald-400">
                            {currency} {item.dailyRate || 0}
                          </td>
                          <td className="py-3.5 px-3 font-mono text-zinc-400 text-[11px]">
                            {item.location || "Vault A"}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setItemToEdit(item);
                                  setIsItemDialogOpen(true);
                                }}
                                className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
                                title="Edit Item"
                              >
                                <Edit2 className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.id)}
                                className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 transition-colors"
                                title="Delete Item"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: KIT BUNDLES & BOM */}
      {activeTab === "BUNDLES" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bundles.length === 0 ? (
              <div className="col-span-full py-12 text-center text-zinc-500 font-mono text-xs rounded-2xl border border-dashed border-zinc-800">
                No kit bundles configured yet. Create a bundle recipe to assemble modular BOMs.
              </div>
            ) : (
              bundles.map((bundle) => {
                const totalItems = bundle.items.length;
                const availableItems = bundle.items.filter(
                  (bi) => bi.item.status === "AVAILABLE"
                ).length;
                const isReady = availableItems === totalItems && totalItems > 0;

                const valuation =
                  bundle.dailyRate ||
                  bundle.items.reduce(
                    (sum, bi) => sum + (bi.item.dailyRate || 0) * bi.quantity,
                    0
                  );

                return (
                  <div
                    key={bundle.id}
                    className="rounded-2xl border border-zinc-800 bg-[#0d0d10] p-5 shadow-xl flex flex-col justify-between space-y-4 hover:border-zinc-700 transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {bundle.discipline}
                        </span>

                        {isReady ? (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="size-3" />
                            <span>100% READY</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <AlertTriangle className="size-3" />
                            <span>PARTIAL ({availableItems}/{totalItems})</span>
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-white tracking-tight leading-snug">
                        {bundle.name}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                        {bundle.description}
                      </p>

                      <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-500">
                          {totalItems} Constituent BOM Items
                        </span>
                        <span className="font-bold text-emerald-400">
                          {currency} {valuation} / day
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setInspectingBundle(bundle)}
                        className="flex-1 py-2 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-mono font-semibold transition-colors cursor-pointer text-center"
                      >
                        Inspect BOM & Availability
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setBundleToEdit(bundle);
                            setIsBundleDialogOpen(true);
                          }}
                          className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
                          title="Edit Bundle"
                        >
                          <Edit2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBundle(bundle.id)}
                          className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 transition-colors"
                          title="Delete Bundle"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SHOOT RESERVATIONS & INSPECTIONS */}
      {activeTab === "RESERVATIONS" && (
        <div className="rounded-2xl border border-zinc-800 bg-[#0d0d10] overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-mono uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Project</th>
                  <th className="py-3 px-4">Equipment Item</th>
                  <th className="py-3 px-3">Window Dates</th>
                  <th className="py-3 px-3">Reservation Status</th>
                  <th className="py-3 px-3">Inspection Audit</th>
                  <th className="py-3 px-4 text-right">Inspection Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {reservations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-500 font-mono text-xs">
                      No shoot reservations recorded.
                    </td>
                  </tr>
                ) : (
                  reservations.map((res) => {
                    const isReserved = res.status === "RESERVED";
                    const isCheckedOut = res.status === "CHECKED_OUT";
                    const isReturned = res.status === "RETURNED";

                    const startStr =
                      res.startDate instanceof Date
                        ? res.startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        : String(res.startDate);
                    const endStr =
                      res.endDate instanceof Date
                        ? res.endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                        : String(res.endDate);

                    return (
                      <tr key={res.id} className="hover:bg-zinc-900/50 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-white">
                          <div>{res.project.title}</div>
                          <div className="text-[10px] font-mono text-amber-400">
                            {res.project.projectNumber}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-zinc-200">{res.item.name}</div>
                          <div className="text-[10px] font-mono text-zinc-500">
                            {res.item.sku} • Current Cond: {res.item.condition}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 font-mono text-zinc-300">
                          {startStr} – {endStr}
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                              isCheckedOut
                                ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                                : isReserved
                                ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                                : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                            }`}
                          >
                            {isCheckedOut ? (
                              <>
                                <Camera className="size-3" />
                                <span>CHECKED_OUT</span>
                              </>
                            ) : isReserved ? (
                              <>
                                <Clock className="size-3" />
                                <span>RESERVED</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="size-3" />
                                <span>RETURNED</span>
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-xs">
                          {res.inspection ? (
                            <div className="space-y-0.5">
                              <div className="text-zinc-300 font-mono text-[11px] truncate max-w-xs">
                                {res.inspection.inspectorName}
                              </div>
                              <div className="text-zinc-500 text-[10px] truncate max-w-xs">
                                {res.inspection.checkoutCondition}
                              </div>
                              {res.inspection.checkinCondition && (
                                <div className="text-emerald-400 text-[10px] truncate max-w-xs">
                                  {res.inspection.checkinCondition}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-zinc-500 font-mono text-[10px]">
                              Pending Pre-Inspection
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {isReserved && (
                            <button
                              type="button"
                              onClick={() => {
                                setInspectionReservation(res);
                                setInspectionMode("PRE_SHOOT");
                                setIsInspectionDialogOpen(true);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/40 text-xs font-mono font-bold transition-all cursor-pointer"
                            >
                              Pre-Shoot Check-Out
                            </button>
                          )}

                          {isCheckedOut && (
                            <button
                              type="button"
                              onClick={() => {
                                setInspectionReservation(res);
                                setInspectionMode("POST_SHOOT");
                                setIsInspectionDialogOpen(true);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-black border border-emerald-500/40 text-xs font-mono font-bold transition-all cursor-pointer"
                            >
                              Post-Shoot Check-In
                            </button>
                          )}

                          {isReturned && (
                            <span className="text-[11px] font-mono text-zinc-500 flex items-center justify-end gap-1">
                              <ShieldCheck className="size-3.5 text-emerald-400" />
                              <span>Audit Finalized</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dialog Modals */}
      <GearItemDialog
        isOpen={isItemDialogOpen}
        onClose={() => setIsItemDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        itemToEdit={itemToEdit}
        onSuccess={() => {
          // Re-fetch or trigger reload
          window.location.reload();
        }}
      />

      <KitBundleDialog
        isOpen={isBundleDialogOpen}
        onClose={() => setIsBundleDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        availableItems={items}
        bundleToEdit={bundleToEdit}
        onSuccess={() => {
          window.location.reload();
        }}
      />

      <KitBundleBomViewer
        bundle={inspectingBundle}
        currency={currency}
        onClose={() => setInspectingBundle(null)}
      />

      <InspectionDialog
        isOpen={isInspectionDialogOpen}
        onClose={() => setIsInspectionDialogOpen(false)}
        tenantId={tenantId}
        tenantSlug={tenantSlug}
        reservation={inspectionReservation}
        mode={inspectionMode}
        onSuccess={() => {
          window.location.reload();
        }}
      />
    </div>
  );
}
