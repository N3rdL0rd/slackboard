import type { GradeRow } from "./grades";

/** The server's difficulty_grades table. It is not part of /sync; the official app ships it inside its database. */
export const GRADE_ROWS: GradeRow[] = [
  { difficulty: 10, boulder_name: "4a/V0", route_name: "5b/5.9" },
  { difficulty: 11, boulder_name: "4b/V0", route_name: "5c/5.10a" },
  { difficulty: 12, boulder_name: "4c/V0", route_name: "6a/5.10b" },
  { difficulty: 13, boulder_name: "5a/V1", route_name: "6a+/5.10c" },
  { difficulty: 14, boulder_name: "5b/V1", route_name: "6b/5.10d" },
  { difficulty: 15, boulder_name: "5c/V2", route_name: "6b+/5.11a" },
  { difficulty: 16, boulder_name: "6a/V3", route_name: "6c/5.11b" },
  { difficulty: 17, boulder_name: "6a+/V3", route_name: "6c+/5.11c" },
  { difficulty: 18, boulder_name: "6b/V4", route_name: "7a/5.11d" },
  { difficulty: 19, boulder_name: "6b+/V4", route_name: "7a+/5.12a" },
  { difficulty: 20, boulder_name: "6c/V5", route_name: "7b/5.12b" },
  { difficulty: 21, boulder_name: "6c+/V5", route_name: "7b+/5.12c" },
  { difficulty: 22, boulder_name: "7a/V6", route_name: "7c/5.12d" },
  { difficulty: 23, boulder_name: "7a+/V7", route_name: "7c+/5.13a" },
  { difficulty: 24, boulder_name: "7b/V8", route_name: "8a/5.13b" },
  { difficulty: 25, boulder_name: "7b+/V8", route_name: "8a+/5.13c" },
  { difficulty: 26, boulder_name: "7c/V9", route_name: "8b/5.13d" },
  { difficulty: 27, boulder_name: "7c+/V10", route_name: "8b+/5.14a" },
  { difficulty: 28, boulder_name: "8a/V11", route_name: "8c/5.14b" },
  { difficulty: 29, boulder_name: "8a+/V12", route_name: "8c+/5.14c" },
  { difficulty: 30, boulder_name: "8b/V13", route_name: "9a/5.14d" },
  { difficulty: 31, boulder_name: "8b+/V14", route_name: "9a+/5.15a" },
  { difficulty: 32, boulder_name: "8c/V15", route_name: "9b/5.15b" },
  { difficulty: 33, boulder_name: "8c+/V16", route_name: "9b+/5.15c" },
];
