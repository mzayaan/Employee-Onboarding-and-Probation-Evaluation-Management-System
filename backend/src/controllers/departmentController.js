// =============================================================================
// src/controllers/departmentController.js
// Department management — list, create, update, assign/remove manager
// FR-04, FR-19 | NFR-03
// Updated: added assignManager and removeManager endpoints to enforce
//          the one-dedicated-manager-per-department rule (lecturer requirement)
// =============================================================================

const { Op } = require('sequelize');
const { Department, User } = require('../models');
const { createAuditLog } = require('../utils/auditLogger');

const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

// =============================================================================
// GET /api/departments
// Returns all departments including the assigned manager details.
// Accessible by HR_ADMIN, LINE_MANAGER, SYSTEM_ADMIN, DIRECTOR.
// =============================================================================
const listDepartments = async (req, res) => {
  try {
    const departments = await Department.findAll({
      include: [
        {
          model: User,
          as: 'departmentManager',
          attributes: ['user_id', 'first_name', 'last_name', 'email'],
          required: false,
        },
      ],
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

// =============================================================================
// PATCH /api/departments/:id/manager
// Assigns a LINE_MANAGER to a department as its dedicated manager.
// HR_ADMIN and SYSTEM_ADMIN only.
//
// Business rules (FR-19 / lecturer requirement):
//  1. The user must be a LINE_MANAGER with an active account.
//  2. A manager can only be assigned to ONE department (UNIQUE on manager_id).
//     If the manager is already assigned to another department, this returns 409.
//  3. Replaces any previously assigned manager for this department (the old
//     manager's assignment is cleared first).
// =============================================================================
const assignManager = async (req, res) => {
  try {
    const { id } = req.params;
    const { manager_id } = req.body;

    if (!manager_id) {
      return res.status(400).json({ success: false, message: 'manager_id is required.' });
    }

    const department = await Department.findByPk(id);
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found.' });
    }

    // Validate the manager exists and is an active LINE_MANAGER
    const manager = await User.findOne({
      where: { user_id: manager_id, role: 'LINE_MANAGER', is_active: true },
      attributes: ['user_id', 'first_name', 'last_name', 'email'],
    });
    if (!manager) {
      return res.status(404).json({
        success: false,
        message: 'The specified user does not exist, is not a Line Manager, or is inactive.',
      });
    }

    // Check whether this manager is already assigned to a DIFFERENT department.
    // (The UNIQUE constraint on Department.manager_id handles this at DB level,
    // but we check here first to return a descriptive 409 rather than a raw DB error.)
    const alreadyAssigned = await Department.findOne({
      where: {
        manager_id,
        department_id: { [Op.ne]: id },
      },
    });
    if (alreadyAssigned) {
      return res.status(409).json({
        success: false,
        message: `${manager.first_name} ${manager.last_name} is already the manager of "${alreadyAssigned.name}". A manager can only be assigned to one department. Unassign them first.`,
      });
    }

    // If this department currently has a different manager, that manager is
    // implicitly unassigned by this update (FK becomes null for their previous dept).
    await department.update({ manager_id });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'DEPARTMENT_MANAGER_ASSIGNED',
      description: `Manager "${manager.first_name} ${manager.last_name}" (ID: ${manager_id}) assigned to department "${department.name}" (ID: ${id}).`,
      ipAddress:   getIp(req),
    });

    const updated = await Department.findByPk(id, {
      include: [{
        model: User,
        as: 'departmentManager',
        attributes: ['user_id', 'first_name', 'last_name', 'email'],
      }],
    });

    return res.status(200).json({
      success: true,
      message: `${manager.first_name} ${manager.last_name} has been assigned as manager of "${department.name}".`,
      data: updated,
    });
  } catch (error) {
    console.error('[departmentController.assignManager]', error.message);
    // Catch any UNIQUE constraint violation that slipped through the service check
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        message: 'This manager is already assigned to another department.',
      });
    }
    return res.status(500).json({ success: false, message: 'Failed to assign manager.' });
  }
};

// =============================================================================
// DELETE /api/departments/:id/manager
// Removes (unassigns) the current manager from a department.
// HR_ADMIN and SYSTEM_ADMIN only.
// =============================================================================
const removeManager = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findByPk(id, {
      include: [{
        model: User,
        as: 'departmentManager',
        attributes: ['user_id', 'first_name', 'last_name'],
        required: false,
      }],
    });
    if (!department) {
      return res.status(404).json({ success: false, message: 'Department not found.' });
    }

    if (!department.manager_id) {
      return res.status(400).json({ success: false, message: 'This department has no assigned manager.' });
    }

    const previousManagerName = department.departmentManager
      ? `${department.departmentManager.first_name} ${department.departmentManager.last_name}`
      : `ID ${department.manager_id}`;

    await department.update({ manager_id: null });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'DEPARTMENT_MANAGER_REMOVED',
      description: `Manager "${previousManagerName}" removed from department "${department.name}" (ID: ${id}).`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({
      success: true,
      message: `Manager unassigned from "${department.name}".`,
    });
  } catch (error) {
    console.error('[departmentController.removeManager]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to remove manager.' });
  }
};

module.exports = { listDepartments, createDepartment, updateDepartment, assignManager, removeManager };
