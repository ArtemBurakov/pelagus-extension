import React, { ReactElement } from "react"
import { selectCurrentAccountSigner } from "@pelagus/pelagus-background/redux-slices/selectors"
import { selectSigningData } from "@pelagus/pelagus-background/redux-slices/signing"
import { useBackgroundSelector } from "../hooks"
import Signing from "../components/Signing"

export default function PersonalSignData(): ReactElement {
  const signingDataRequest = useBackgroundSelector(selectSigningData)

  const currentAccountSigner = useBackgroundSelector(selectCurrentAccountSigner)

  if (currentAccountSigner === null || signingDataRequest === undefined) {
    return <></>
  }

  return <Signing request={signingDataRequest} />
}
