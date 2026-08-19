import { Box, Button } from '@mui/material';

export interface RetrievableCrewActionsProps {
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
}

function RetrievableCrewActions({ onAdd, onEdit, onDelete, canEdit, canDelete }: RetrievableCrewActionsProps) {
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      <Button variant="contained" onClick={onAdd}>
        Add
      </Button>
      <Button variant="outlined" onClick={onEdit} disabled={!canEdit}>
        Edit
      </Button>
      <Button variant="outlined" color="error" onClick={onDelete} disabled={!canDelete}>
        Delete
      </Button>
    </Box>
  );
}

export default RetrievableCrewActions;
