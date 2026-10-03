// Use the complete random session UUID, rather than a prefix that can collide.
// Deriving the code keeps existing records and retried saves compatible.
export function resultCode(id) {
  return id.toUpperCase();
}
