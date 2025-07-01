export const TABLE_NAME = {
  USERS: process.env.USERS_TABLE,
  COMMENTS: process.env.COMMENTS_TABLE,
  QUIZ_PROGRESS: process.env.QUIZ_PROGRESS_TABLE,
  USER_ACHIEVEMENTS: process.env.USER_ACHIEVEMENTS_TABLE,
  CERTIFICATES: process.env.CERTIFICATES_TABLE,
};

export const STATUS = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
};

export const ENTITY_TYPE = {
  DATABASE: "database",
  DBTOOL: "dbtool",
  BLOG: "blog",
};
