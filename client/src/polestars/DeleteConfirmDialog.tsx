import { Button, CircularProgress, Dialog, DialogActions, DialogTitle } from '@mui/material';

export interface DeleteConfirmDialogProps {
  open: boolean;
  crewName: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmDialog({ open, crewName, submitting, onCancel, onConfirm }: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={submitting ? undefined : onCancel}>
      <DialogTitle>Delete {crewName} from Retrievable Crew?</DialogTitle>
      <DialogActions>
        <Button onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={onConfirm}
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default DeleteConfirmDialog;
