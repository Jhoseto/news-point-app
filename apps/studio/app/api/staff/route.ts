import { editorMutation } from "@/lib/api";
import { createUser, createUserInput } from "@/lib/users";

export async function POST(request: Request) {
  return editorMutation(request, createUserInput, (staff, input) => createUser(staff, input), 201);
}
