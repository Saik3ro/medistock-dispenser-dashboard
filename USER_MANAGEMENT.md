# User Management & Authentication Guide

## Overview

MediStock supports multiple user roles for managing medication dispensing in healthcare settings.

## User Roles

### Admin
**Permissions:**
- ✅ Full access to all features
- ✅ Manage other users
- ✅ Create/edit schedules
- ✅ Configure device settings
- ✅ View all logs and alerts
- ✅ Generate invite codes
- ✅ Resolve alerts

**Use Case:** Healthcare facility manager, medical director

### Caregiver
**Permissions:**
- ✅ View schedules
- ✅ Refill inventory
- ✅ View dispense logs
- ✅ Acknowledge alerts
- ✅ Manage medication stock
- ❌ Cannot create users
- ❌ Cannot modify schedules
- ❌ Cannot change device settings

**Use Case:** Nurse, medication aid, facility staff

### Patient
**Permissions:**
- ✅ View own schedules
- ✅ View own dispense history
- ✅ Receive notifications
- ❌ Cannot modify anything
- ❌ Cannot manage other users

**Use Case:** Patient monitoring own medication

---

## Firebase User Structure

### User Account (`/users/{uid}`)

```json
{
  "uid": "firebase_user_id",
  "email": "caregiver@example.com",
  "displayName": "John Smith",
  "role": "caregiver",
  "phone": "+63-9XX-XXX-XXXX",
  "avatar": "https://storage.googleapis.com/...",
  "createdAt": 1719456000000,
  "lastLogin": 1719456000000,
  "status": "active",
  "assigned_slots": [1, 2],
  "facility": "St. Mary's Hospital"
}
```

---

## Invite System

### Generate Invite Code

**Admin function:**

```typescript
import { addInvite } from "@/lib/firebase-service";

const code = await addInvite({
  email: "new_caregiver@example.com",
  role: "caregiver",
  expiresIn: 7 * 24 * 60 * 60 * 1000 // 7 days
});

console.log("Invite code:", code);
// Share with user: https://medistock.app/join?code={code}
```

### Invite Structure (`/invites/{code}`)

```json
{
  "code": "ABC123XYZ",
  "email": "new_caregiver@example.com",
  "role": "caregiver",
  "createdAt": 1719456000000,
  "expiresAt": 1720061000000,
  "used": false,
  "usedBy": null,
  "usedAt": null
}
```

### Accept Invite

When user visits `/join?code=ABC123XYZ`:

```typescript
import { acceptInvite } from "@/lib/firebase-service";

const success = await acceptInvite(code, userEmail);

if (success) {
  // Redirect to dashboard
  navigate("/app/dashboard");
} else {
  // Show error: Code expired or invalid
}
```

---

## Create User API Functions

### Add User (Admin Only)

```typescript
export async function addUser(userData: {
  email: string;
  displayName: string;
  role: "admin" | "caregiver" | "patient";
  phone?: string;
}): Promise<string | null> {
  try {
    const userRef = ref(db, `/users/${auth.currentUser.uid}`);
    await set(userRef, {
      ...userData,
      createdAt: Date.now(),
      lastLogin: Date.now(),
      status: "active",
    });
    return auth.currentUser.uid;
  } catch (error) {
    console.error("Failed to add user:", error);
    return null;
  }
}
```

### Get User Profile

```typescript
export async function getUserProfile(uid: string) {
  try {
    const userRef = ref(db, `/users/${uid}`);
    const snapshot = await get(userRef);
    return snapshot.val();
  } catch (error) {
    console.error("Failed to get user profile:", error);
    return null;
  }
}
```

### Update User Profile

```typescript
export async function updateUserProfile(
  uid: string,
  updates: Partial<User>
) {
  try {
    const userRef = ref(db, `/users/${uid}`);
    await update(userRef, {
      ...updates,
      lastLogin: Date.now(),
    });
    return true;
  } catch (error) {
    console.error("Failed to update user:", error);
    return false;
  }
}
```

### Subscribe to Users (Admin)

```typescript
export function subscribeToUsers(callback: (users: User[]) => void) {
  const usersRef = ref(db, "/users");
  return onValue(usersRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const users = Object.entries(data).map(([uid, userData]: any) => ({
        uid,
        ...userData,
      }));
      callback(users);
    } else {
      callback([]);
    }
  });
}
```

### Delete User (Admin Only)

```typescript
export async function deleteUser(uid: string) {
  try {
    const userRef = ref(db, `/users/${uid}`);
    await remove(userRef);
    return true;
  } catch (error) {
    console.error("Failed to delete user:", error);
    return false;
  }
}
```

---

## Authentication Flow

### Sign Up with Invite

```typescript
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

export async function signUpWithInvite(
  email: string,
  password: string,
  inviteCode: string
) {
  try {
    // Create Firebase auth user
    const { user } = await createUserWithEmailAndPassword(auth, email, password);

    // Get invite details
    const inviteRef = ref(db, `/invites/${inviteCode}`);
    const inviteSnap = await get(inviteRef);

    if (!inviteSnap.exists()) {
      throw new Error("Invalid invite code");
    }

    const inviteData = inviteSnap.val();

    // Verify not expired
    if (inviteData.expiresAt < Date.now()) {
      throw new Error("Invite code expired");
    }

    // Create user profile
    const userRef = ref(db, `/users/${user.uid}`);
    await set(userRef, {
      uid: user.uid,
      email: user.email,
      displayName: email.split("@")[0],
      role: inviteData.role,
      createdAt: Date.now(),
      lastLogin: Date.now(),
      status: "active",
    });

    // Mark invite as used
    await update(inviteRef, {
      used: true,
      usedBy: user.uid,
      usedAt: Date.now(),
    });

    return user;
  } catch (error) {
    console.error("Sign up failed:", error);
    throw error;
  }
}
```

### Login

```typescript
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

export async function login(email: string, password: string) {
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);

    // Update last login
    const userRef = ref(db, `/users/${user.uid}`);
    await update(userRef, {
      lastLogin: Date.now(),
    });

    return user;
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
}
```

### Logout

```typescript
import { signOut } from "firebase/auth";
import { auth } from "./firebase";

export async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout failed:", error);
  }
}
```

---

## Firebase Security Rules for Users

```json
{
  "rules": {
    "users": {
      ".read": false,
      ".write": false,
      "$uid": {
        ".read": "auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".validate": "newData.hasChildren(['email', 'displayName', 'role'])"
      }
    },
    "invites": {
      ".read": false,
      ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin'"
    }
  }
}
```

---

## User Management UI (Component Example)

```typescript
// src/routes/_app/settings.tsx

export function UserManagement() {
  const [users, setUsers] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToUsers(setUsers);
    return () => unsubscribe?.();
  }, []);

  const handleInvite = async (email: string, role: string) => {
    const code = await addInvite({
      email,
      role,
      expiresIn: 7 * 24 * 60 * 60 * 1000,
    });

    // Show link to share: https://medistock.app/join?code={code}
    toast.success(`Invite code: ${code}`);
  };

  const handleRemoveUser = async (uid: string) => {
    const confirmed = window.confirm("Remove this user?");
    if (confirmed) {
      await deleteUser(uid);
      toast.success("User removed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">User Management</h2>
        <button
          onClick={() => setShowInviteModal(true)}
          className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
        >
          Invite User
        </button>
      </div>

      <div className="space-y-2">
        {users.map((user) => (
          <div
            key={user.uid}
            className="flex items-center justify-between p-4 bg-slate-800 rounded"
          >
            <div>
              <p className="font-semibold">{user.displayName}</p>
              <p className="text-gray-400 text-sm">{user.email}</p>
              <span className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded">
                {user.role}
              </span>
            </div>
            <button
              onClick={() => handleRemoveUser(user.uid)}
              className="text-red-400 hover:text-red-600"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {showInviteModal && (
        <InviteUserModal
          onInvite={handleInvite}
          onClose={() => setShowInviteModal(false)}
        />
      )}
    </div>
  );
}
```

---

## Invite Link Sharing

### Email Invite Template

```html
<h1>You're invited to MediStock!</h1>

<p>Hello,</p>

<p>
  You've been invited to join MediStock, a medication management system for
  healthcare facilities.
</p>

<p>
  <strong>Role:</strong> Caregiver
  <br />
  <strong>Facility:</strong> St. Mary's Hospital
</p>

<p>
  Click the link below to accept the invitation:
</p>

<a href="https://medistock.app/join?code=ABC123XYZ">
  https://medistock.app/join?code=ABC123XYZ
</a>

<p>
  <small>This link expires in 7 days.</small>
</p>

<p>
  Best regards,<br />
  MediStock Team
</p>
```

### SMS Invite Template

```
Hi [Name], You're invited to MediStock!
Accept here: https://medistock.app/join?code=ABC123XYZ
Expires in 7 days.
```

---

## Role-Based Access Control (RBAC)

### Check User Permissions

```typescript
export function canUserAccess(user: User, action: string): boolean {
  const permissions = {
    admin: [
      "view_all_slots",
      "edit_schedules",
      "manage_users",
      "configure_device",
      "view_all_logs",
      "resolve_alerts",
    ],
    caregiver: [
      "view_all_slots",
      "view_schedules",
      "refill_inventory",
      "view_all_logs",
      "acknowledge_alerts",
    ],
    patient: [
      "view_own_slots",
      "view_own_schedules",
      "view_own_logs",
    ],
  };

  return permissions[user.role]?.includes(action) || false;
}
```

### Protected Component

```typescript
import { canUserAccess } from "@/lib/auth";

export function AdminOnlyFeature({ user }) {
  if (!canUserAccess(user, "manage_users")) {
    return <div>Access Denied</div>;
  }

  return <UserManagementPanel />;
}
```

---

## Best Practices

1. **Always verify user role before sensitive operations**
   ```typescript
   if (user.role !== "admin") {
     throw new Error("Admin only");
   }
   ```

2. **Use Firebase Security Rules for data protection**
   - Never rely on client-side checks only
   - Rules enforce permissions server-side

3. **Log important actions**
   ```typescript
   await logAction({
     user_id: user.uid,
     action: "user_deleted",
     target_uid: uid_to_delete,
     timestamp: Date.now(),
   });
   ```

4. **Expire invites**
   - Set expiration to 7-14 days
   - Require users to validate email

5. **Audit trail**
   - Track who did what and when
   - Important for healthcare compliance

---

## Compliance Notes

MediStock is designed for healthcare use, so:

- ✅ HIPAA-compatible architecture
- ✅ Audit trail for all actions
- ✅ Role-based access control
- ✅ Secure credential storage
- ✅ Firebase security rules enforcement

---

**Version:** 3.2  
**Last Updated:** June 25, 2024
