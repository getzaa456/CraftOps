const SIZE_CLASS = { md: '', lg: 'voxel-lg' };

export function VoxelBlock({ status = 'stopped', size = 'md' }) {
  return <div className={`voxel voxel-${status} ${SIZE_CLASS[size] || ''}`} aria-hidden="true" />;
}
