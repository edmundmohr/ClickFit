import { describe, expect, it } from "vitest";
import {
  canAccessOwnedRecord,
  canChangeRoleOf,
  canDeleteUser,
  canManageUsers,
  isValidUsername,
  canSetPasswordFor,
  canViewUserList,
  isAdmin,
  isRole,
  type Actor,
} from "@/domain/permissions/user-management";

const admin: Actor = { id: "admin-1", role: "admin" };
const anna: Actor = { id: "anna-1", role: "user" };

describe("user management permissions", () => {
  it("recognizes valid roles only", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("user")).toBe(true);
    expect(isRole("owner")).toBe(false);
  });

  it("treats only the admin role as admin", () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(anna)).toBe(false);
    expect(isAdmin(null)).toBe(false);
  });

  it("lets only admins see the user list", () => {
    expect(canViewUserList(admin)).toEqual({ allowed: true });
    expect(canViewUserList(anna)).toEqual({ allowed: false, reason: "NOT_ADMIN" });
  });

  it("lets an admin set the password of another user", () => {
    expect(canSetPasswordFor(admin, anna.id)).toEqual({ allowed: true });
  });

  it("denies normal users setting anyone's password", () => {
    expect(canSetPasswordFor(anna, admin.id)).toEqual({ allowed: false, reason: "NOT_ADMIN" });
    expect(canSetPasswordFor(anna, anna.id)).toEqual({ allowed: false, reason: "NOT_ADMIN" });
  });

  it("makes admins use the regular change flow for their own password", () => {
    expect(canSetPasswordFor(admin, admin.id)).toEqual({
      allowed: false,
      reason: "SELF_NOT_ALLOWED",
    });
  });

  it("lets only admins create and edit accounts", () => {
    expect(canManageUsers(admin)).toEqual({ allowed: true });
    expect(canManageUsers(anna)).toEqual({ allowed: false, reason: "NOT_ADMIN" });
  });

  it("lets an admin change the role of others but never the own one", () => {
    expect(canChangeRoleOf(admin, anna.id)).toEqual({ allowed: true });
    expect(canChangeRoleOf(admin, admin.id)).toEqual({ allowed: false, reason: "OWN_ACCOUNT_PROTECTED" });
    expect(canChangeRoleOf(anna, admin.id)).toEqual({ allowed: false, reason: "NOT_ADMIN" });
  });

  it("lets an admin delete others but never the own account", () => {
    expect(canDeleteUser(admin, anna.id)).toEqual({ allowed: true });
    expect(canDeleteUser(admin, admin.id)).toEqual({ allowed: false, reason: "OWN_ACCOUNT_PROTECTED" });
    expect(canDeleteUser(anna, anna.id)).toEqual({ allowed: false, reason: "NOT_ADMIN" });
    expect(canDeleteUser(anna, admin.id)).toEqual({ allowed: false, reason: "NOT_ADMIN" });
  });

  it("accepts only usernames the sign-in accepts", () => {
    expect(isValidUsername("Anna")).toBe(true);
    expect(isValidUsername("max_m.2")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(31))).toBe(false);
    expect(isValidUsername("Jörg")).toBe(false);
    expect(isValidUsername("anna maria")).toBe(false);
    expect(isValidUsername("anna@home")).toBe(false);
  });

  it("restricts owned records to their owner, even for admins", () => {
    expect(canAccessOwnedRecord(anna, anna.id)).toBe(true);
    expect(canAccessOwnedRecord(anna, admin.id)).toBe(false);
    expect(canAccessOwnedRecord(admin, anna.id)).toBe(false);
  });
});
