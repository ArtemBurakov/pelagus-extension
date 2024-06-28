import {
  InternalSignerPrivateKey,
  InternalSignerWithType,
  SignerSourceTypes,
} from "./types"
import { randomBytes } from "quais"

export const isPrivateKey = (
  signer: InternalSignerWithType
): signer is InternalSignerPrivateKey =>
  signer.type === SignerSourceTypes.privateKey

export const generateRandomBytes = (numWords: number): Uint8Array => {
  const strength = (numWords / 3) * 32
  return randomBytes(strength / 8)
}
