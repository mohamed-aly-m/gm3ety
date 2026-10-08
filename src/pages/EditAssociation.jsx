import React from "react";
import { useParams } from "react-router-dom";
import CreateAssociation from "./CreateAssociation";

/**
 * EditAssociation Component
 * Reuses the full 4-step wizard workflow from CreateAssociation/Renew in "edit" mode.
 * Preserves the exact same association_id, locks editing if collection has started,
 * and syncs members, shares, and cycles if collection has not started.
 */
export default function EditAssociation() {
  const { id } = useParams();
  return <CreateAssociation mode="edit" editAssociationId={id} />;
}
