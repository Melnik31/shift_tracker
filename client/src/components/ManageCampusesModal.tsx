import Modal from './Modal';
import CampusManager from './CampusManager';

export default function ManageCampusesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Manage Campuses" onClose={onClose}>
      <CampusManager />
    </Modal>
  );
}
