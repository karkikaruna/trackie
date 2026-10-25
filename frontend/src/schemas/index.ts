import { z } from "zod";

// Keep these rules in sync with backend/app/schemas (the server is the real authority).
export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(128, "Use at most 128 characters.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/\d/, "Include at least one number.");

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter your email.").email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name.").max(100, "Name is too long."),
    email: z.string().trim().min(1, "Enter your email.").email("Enter a valid email address."),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match.",
  });
export type RegisterValues = z.infer<typeof registerSchema>;

export const projectSchema = z.object({
  name: z.string().trim().min(1, "Enter a project name.").max(120, "Name is too long."),
  key: z
    .string()
    .trim()
    .regex(/^([A-Za-z][A-Za-z0-9]{1,9})?$/, "2-10 letters/numbers, starting with a letter."),
  description: z.string().max(2000, "Description is too long."),
});
export type ProjectValues = z.infer<typeof projectSchema>;

export const issueSchema = z.object({
  project_id: z.string().min(1, "Choose a project."),
  title: z.string().trim().min(1, "Enter a title.").max(200, "Title must be 200 characters or fewer."),
  description: z.string().max(10000, "Description is too long."),
  issue_type: z.enum(["BUG", "TASK", "FEATURE"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  assignee_id: z.string(), // "" means unassigned
});
export type IssueValues = z.infer<typeof issueSchema>;

export const issueEditSchema = z.object({
  title: issueSchema.shape.title,
  description: issueSchema.shape.description,
  issue_type: issueSchema.shape.issue_type,
});
export type IssueEditValues = z.infer<typeof issueEditSchema>;

export const memberSchema = z.object({
  email: z.string().trim().min(1, "Enter an email.").email("Enter a valid email address."),
});
export type MemberValues = z.infer<typeof memberSchema>;

export const profileSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name.").max(100, "Name is too long."),
    current_password: z.string(),
    new_password: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!v.new_password) return;
    const strength = passwordSchema.safeParse(v.new_password);
    if (!strength.success) {
      ctx.addIssue({ code: "custom", path: ["new_password"], message: strength.error.issues[0].message });
    }
    if (!v.current_password) {
      ctx.addIssue({ code: "custom", path: ["current_password"], message: "Enter your current password." });
    }
  });
export type ProfileValues = z.infer<typeof profileSchema>;

export const reportSchema = z.object({
  report: z
    .string()
    .trim()
    .min(10, "Describe the problem in at least 10 characters.")
    .max(5000, "Reports are limited to 5,000 characters."),
});
export type ReportValues = z.infer<typeof reportSchema>;
