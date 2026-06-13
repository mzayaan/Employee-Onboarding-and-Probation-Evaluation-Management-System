// =============================================================================
// src/controllers/departmentController.js
// Department management — list, create, update
// FR-04 | NFR-03
// =============================================================================

const { Department } = require('../models');
const { createAuditLog } = require('../utils/auditLogger');

const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

// =============================================================================
// GET /api/departments
// Returns all departments. Accessible by HR_ADMIN, LINE_MANAGER, SYSTEM_ADMIN.
// =============================================================================
const listDepartments = async (req, res) => {
  try {
    const departments = await Department.findAll({
      order: [['name', 'ASC']],
    });
    return res.status(200).json({ success: true, data: departments });
  } catch (error) {
    console.error('[departmentController.listDepartments]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve departments.' });
  }
};

// =============================================================================
// POST /api/departments
// Creates a new department. HR_ADMIN and SYSTEM_ADMIN only.
// =============================================================================
const createDepartment = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Department name is required.' });
    }

    const existing = await Department.findOne({ where: { name: name.trim() } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'A department with this name already exists.' });
    }

    const department = await Department.create({
      name: name.trim(),
      description: description?.trim() || null,
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'CREATE_DEPARTMENT',
      description: `Department "${department.name}" created.`,
      ipAddress:   getIp(req),
    });

    return res.status(201).json({ success: true, message: 'Department created.', data: department });
  } catch (error) {
    console.error('[departmentController.createDepartment]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to create department.' });
  }
};

// =============================================================================
// PUT /api/departments/:id
// Updates department name/description. HR_ADMIN and SYSTEM_ADMIN only.
// =============================================================================
const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const department = await Department.findByPk(id);
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found.' });
    }

    if (name && name.trim() !== department.name) {
      const existing = await Department.findOne({ where: { name: name.trim() } });
      if (existing) {
        return res.status(409).json({ success: false, message: 'A department with this name already exists.' });
      }
    }

    await department.update({
      name:        name?.trim()        || department.name,
      description: description?.trim() ?? department.description,
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'UPDATE_DEPARTMENT',
      description: `Department ID ${id} updated.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({ success: true, message: 'Department updated.', data: department });
  } catch (error) {
    console.error('[departmentController.updateDepartment]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to update department.' });
  }
};

module.exports = { listDepartments, createDepartment, updateDepartment };
