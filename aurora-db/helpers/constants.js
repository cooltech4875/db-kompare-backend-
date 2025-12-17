// src/constants/enums.js

export const TABLE_NAME = {
  QUESTIONS: process.env.QUESTIONS_TABLE,
  SOLUTIONS: process.env.SOLUTIONS_TABLE,
  SUBMISSIONS: process.env.SUBMISSIONS_TABLE,
  FIDDLES: process.env.FIDDLES_TABLE,
  USERS: process.env.USERS_TABLE,
  USER_ACHIEVEMENTS: process.env.USER_ACHIEVEMENTS_TABLE,
  CERTIFICATION_PLANS: process.env.CERTIFICATION_PLANS_TABLE,
};

export const LessonCategory = {
  BASIC: "BASIC",
  INTERMEDIATE: "INTERMEDIATE",
  HARD: "HARD",
};

export const LessonType = {
  SQL: "SQL",
  PGSQL: "PGSQL",
  MYSQL: "MYSQL",
  ORACLE: "ORACLE",
  MSSQL: "MSSQL",
  OTHER: "OTHER",
};

export const SupportedRuntime = {
  POSTGRES: "POSTGRES",
  MYSQL: "MYSQL",
};

export const Difficulty = {
  ALL: "ALL",
  EASY: "EASY",
  MEDIUM: "MEDIUM",
  HARD: "HARD",
};

export const QuestionType = {
  INTERVIEW: "INTERVIEW",
  LESSON: "LESSON",
};

export const CERTIFICATION_PLAN_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
};
