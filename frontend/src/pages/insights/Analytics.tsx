import { BarChart3, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useState, useEffect, useMemo } from "react";
import { Document } from "../../types";
import { getAuthToken } from "../../utils/authStorage";

type CategoryStat = {
  category: string;
  count: number;
  totalSize: number;
  color: string;
};

type Point = { x: number; y: number };
type PieSegment = CategoryStat & {
  percentage: number;
  path: string;
  labelStart: Point;
  labelMid: Point;
  labelEnd: Point;
  labelTextX: number;
  labelTextAnchor: "start" | "end";
  valueText: Point;
};

const CATEGORY_COLORS = [
  "#06b6d4",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
  "#0ea5e9",
];

const TOTAL_MEMORY_BYTES = 5 * 1024 * 1024 * 1024;

const normalizeCategory = (value: string | undefined): string => {
  const normalized = String(value || "").trim();
  return normalized || "General";
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatGb = (bytes: number, decimals: number): string => {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(decimals)} GB`;
};

const polarToCartesian = (cx: number, cy: number, radius: number, angle: number): Point => {
  const radians = (angle * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
};

const buildSlicePath = (cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string => {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
};

export default function Analytics() {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/documents", {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });
        if (!response.ok) {
          throw new Error("Unable to load analytics data.");
        }

        const data = await response.json();
        setDocs(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setError((err as Error)?.message || "Unable to load analytics data.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const totalStorageBytes = useMemo(() => {
    return docs.reduce((acc, doc) => acc + Number(doc.size || 0), 0);
  }, [docs]);

  const remainingStorageBytes = useMemo(() => {
    return Math.max(TOTAL_MEMORY_BYTES - totalStorageBytes, 0);
  }, [totalStorageBytes]);

  const usedStorageRatio = useMemo(() => {
    if (TOTAL_MEMORY_BYTES <= 0) {
      return 0;
    }
    return Math.min(totalStorageBytes / TOTAL_MEMORY_BYTES, 1);
  }, [totalStorageBytes]);

  const totalMemoryLabel = useMemo(() => formatGb(TOTAL_MEMORY_BYTES, 2), []);
  const usedMemoryLabel = useMemo(() => formatBytes(totalStorageBytes), [totalStorageBytes]);
  const remainingMemoryLabel = useMemo(() => {
    const remainingGb = remainingStorageBytes / (1024 * 1024 * 1024);
    if (remainingGb >= 1) {
      return formatGb(remainingStorageBytes, 3);
    }
    return formatBytes(remainingStorageBytes);
  }, [remainingStorageBytes]);

  const categoryStats = useMemo((): CategoryStat[] => {
    const map = new Map<string, { count: number; totalSize: number }>();

    for (const doc of docs) {
      const category = normalizeCategory(doc.category);
      const current = map.get(category) ?? { count: 0, totalSize: 0 };
      current.count += 1;
      current.totalSize += Number(doc.size || 0);
      map.set(category, current);
    }

    return [...map.entries()]
      .map(([category, values], index) => ({
        category,
        count: values.count,
        totalSize: values.totalSize,
        color: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      }))
      .sort((a, b) => b.count - a.count || b.totalSize - a.totalSize || a.category.localeCompare(b.category));
  }, [docs]);

  const pieSegments = useMemo((): PieSegment[] => {
    if (categoryStats.length === 0 || docs.length === 0) {
      return [];
    }

    const centerX = 250;
    const centerY = 160;
    const pieRadius = 72;
    const innerLabelRadius = 44;
    const connectorStartRadius = 78;
    const connectorBendRadius = 94;
    const leftEdgeX = 120;
    const rightEdgeX = 380;

    let currentAngle = -90;

    return categoryStats.map((entry) => {
      const percentage = (entry.count / docs.length) * 100;
      const sweep = (entry.count / docs.length) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweep;
      const midAngle = startAngle + sweep / 2;
      currentAngle = endAngle;

      const labelStart = polarToCartesian(centerX, centerY, connectorStartRadius, midAngle);
      const labelMid = polarToCartesian(centerX, centerY, connectorBendRadius, midAngle);
      const isRightSide = Math.cos((midAngle * Math.PI) / 180) >= 0;
      const labelEnd = {
        x: isRightSide ? rightEdgeX : leftEdgeX,
        y: labelMid.y,
      };
      const valueText = polarToCartesian(centerX, centerY, innerLabelRadius, midAngle);

      return {
        ...entry,
        percentage,
        path: buildSlicePath(centerX, centerY, pieRadius, startAngle, endAngle),
        labelStart,
        labelMid,
        labelEnd,
        labelTextX: isRightSide ? labelEnd.x + 4 : labelEnd.x - 4,
        labelTextAnchor: isRightSide ? "start" : "end",
        valueText,
      };
    });
  }, [categoryStats, docs.length]);

  return (
    <div className="space-y-8 text-slate-900 dark:text-slate-100">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics</h1>
        <p className="text-slate-500 dark:text-slate-400">Insights into your document management activity.</p>
      </header>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-indigo-600 dark:text-indigo-300 w-10 h-10" /></div>
      ) : (
        <div>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm"
          >
            <div className="mb-5">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Storage Overview</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Total memory, used memory, and remaining memory.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end min-h-[220px]">
              {[
                { label: "Total Memory", value: totalMemoryLabel, color: "bg-indigo-500", percent: 1 },
                { label: "Storage Used", value: usedMemoryLabel, color: "bg-emerald-500", percent: usedStorageRatio },
                {
                  label: "Memory Remaining",
                  value: remainingMemoryLabel,
                  color: "bg-amber-500",
                  percent: Math.max(0, 1 - usedStorageRatio),
                },
              ].map((bar) => (
                <div key={bar.label} className="flex flex-col items-center">
                  <div className="h-36 w-full max-w-[72px] rounded-xl bg-slate-100 dark:bg-slate-800 p-1 flex items-end">
                    <div
                      className={`w-full rounded-lg ${bar.color} transition-all duration-500`}
                      style={{ height: `${Math.max(8, Math.round(bar.percent * 100))}%` }}
                    />
                  </div>
                  <p className="mt-3 text-[11px] text-center font-bold text-slate-600 dark:text-slate-300 leading-tight">
                    {bar.label}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{bar.value}</p>
                </div>
              ))}
            </div>

            {totalStorageBytes > TOTAL_MEMORY_BYTES ? (
              <p className="mt-4 text-xs text-red-600 dark:text-red-300 font-semibold">
                Storage exceeds limit by {formatBytes(totalStorageBytes - TOTAL_MEMORY_BYTES)}.
              </p>
            ) : null}
          </motion.div>
        </div>
      )}

      {error ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-2xl p-4 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      ) : null}

      <div className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <BarChart3 className="w-6 h-6 text-indigo-600 dark:text-indigo-300" />
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Category Distribution</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Pie size is based on number of files in each category.</p>
          </div>
        </div>

        {docs.length === 0 ? (
          <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm">
            No documents available yet to generate category analytics.
          </div>
        ) : (
          <div className="rounded-3xl bg-slate-950 p-4 md:p-5 border border-slate-800 overflow-x-auto">
              <svg viewBox="0 0 500 320" className="h-auto max-w-[760px] min-w-[500px] w-full mx-auto">
                {pieSegments.map((segment) => (
                  <path
                    key={`slice-${segment.category}`}
                    d={segment.path}
                    fill={segment.color}
                    stroke="#0b1220"
                    strokeWidth={2}
                  />
                ))}

                {pieSegments.map((segment) => (
                  <text
                    key={`value-${segment.category}`}
                    x={segment.valueText.x}
                    y={segment.valueText.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="12"
                    fontWeight="700"
                    fill="#ffffff"
                  >
                    {`${Math.round(segment.percentage)}%`}
                  </text>
                ))}

                {pieSegments.map((segment) => (
                  <g key={`label-${segment.category}`}>
                    <polyline
                      points={`${segment.labelStart.x},${segment.labelStart.y} ${segment.labelMid.x},${segment.labelMid.y} ${segment.labelEnd.x},${segment.labelEnd.y}`}
                      fill="none"
                      stroke={segment.color}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <text
                      x={segment.labelTextX}
                      y={segment.labelEnd.y - 6}
                      textAnchor={segment.labelTextAnchor}
                      fontSize="10"
                      fontWeight="700"
                      fill="#f8fafc"
                    >
                      {segment.category.toUpperCase()}
                    </text>
                    <text
                      x={segment.labelTextX}
                      y={segment.labelEnd.y + 7}
                      textAnchor={segment.labelTextAnchor}
                      fontSize="9"
                      fontWeight="600"
                      fill={segment.color}
                    >
                      {`${segment.percentage.toFixed(1)}% - ${segment.count} file${segment.count === 1 ? "" : "s"}`}
                    </text>
                    <text
                      x={segment.labelTextX}
                      y={segment.labelEnd.y + 18}
                      textAnchor={segment.labelTextAnchor}
                      fontSize="9"
                      fontWeight="600"
                      fill="#cbd5e1"
                    >
                      {formatBytes(segment.totalSize)}
                    </text>
                  </g>
                ))}
              </svg>
          </div>
        )}
      </div>
    </div>
  );
}

