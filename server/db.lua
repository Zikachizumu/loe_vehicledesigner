-- Veritabanı: tablolar ilk açılışta otomatik oluşturulur (sql/loe_vehicledesigner.sql elle kurulum içindir).

DB = {}

local SCHEMA = {
    [[CREATE TABLE IF NOT EXISTS `loe_vd_designs` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `owner` VARCHAR(64) NOT NULL,
        `name` VARCHAR(64) NOT NULL,
        `model` VARCHAR(16) NULL,
        `model_label` VARCHAR(64) NULL,
        `data` LONGTEXT NOT NULL,
        `thumb` MEDIUMTEXT NULL,
        `rev` INT NOT NULL DEFAULT 1,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `owner` (`owner`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `loe_vd_assignments` (
        `scope` VARCHAR(8) NOT NULL,
        `key` VARCHAR(32) NOT NULL,
        `model` VARCHAR(16) NULL,
        `model_label` VARCHAR(64) NULL,
        `design_id` INT NOT NULL,
        `set_by` VARCHAR(64) NULL,
        `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`scope`, `key`),
        KEY `design_id` (`design_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
    [[CREATE TABLE IF NOT EXISTS `loe_vd_images` (
        `id` INT NOT NULL AUTO_INCREMENT,
        `owner` VARCHAR(64) NOT NULL,
        `data` LONGTEXT NOT NULL,
        `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `owner` (`owner`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4]],
}

function DB.migrate()
    for _, q in ipairs(SCHEMA) do
        local ok, err = pcall(MySQL.query.await, q)
        if not ok then
            print(('^1[%s] tablo oluşturulamadı: %s^0'):format(VD.Resource, tostring(err)))
            return false
        end
    end
    return true
end

-- ------------------------------------------------------------------ tasarımlar
function DB.getDesign(id)
    return MySQL.single.await('SELECT id, owner, name, model, model_label, data, rev, updated_at FROM loe_vd_designs WHERE id = ?', { id })
end

function DB.countDesigns(owner)
    return MySQL.scalar.await('SELECT COUNT(*) FROM loe_vd_designs WHERE owner = ?', { owner }) or 0
end

function DB.insertDesign(owner, name, model, label, data, thumb)
    return MySQL.insert.await('INSERT INTO loe_vd_designs (owner, name, model, model_label, data, thumb) VALUES (?, ?, ?, ?, ?, ?)',
        { owner, name, model, label, data, thumb })
end

function DB.updateDesign(id, name, model, label, data, thumb)
    MySQL.update.await('UPDATE loe_vd_designs SET name = ?, model = ?, model_label = ?, data = ?, thumb = COALESCE(?, thumb), rev = rev + 1 WHERE id = ?',
        { name, model, label, data, thumb, id })
    return MySQL.scalar.await('SELECT rev FROM loe_vd_designs WHERE id = ?', { id })
end

function DB.renameDesign(id, name)
    return MySQL.update.await('UPDATE loe_vd_designs SET name = ? WHERE id = ?', { name, id })
end

function DB.deleteDesign(id)
    MySQL.update.await('DELETE FROM loe_vd_assignments WHERE design_id = ?', { id })
    return MySQL.update.await('DELETE FROM loe_vd_designs WHERE id = ?', { id })
end

function DB.listDesigns(owner)
    return MySQL.query.await([[SELECT id, name, model, model_label, thumb, DATE_FORMAT(updated_at, '%d.%m.%Y %H:%i') AS updated
        FROM loe_vd_designs WHERE owner = ? ORDER BY updated_at DESC LIMIT 100]], { owner }) or {}
end

function DB.designSummary(id)
    return MySQL.single.await([[SELECT id, owner, name, model, model_label, thumb, DATE_FORMAT(updated_at, '%d.%m.%Y %H:%i') AS updated
        FROM loe_vd_designs WHERE id = ?]], { id })
end

-- ------------------------------------------------------------------ atamalar
function DB.allAssignments()
    return MySQL.query.await([[SELECT a.scope, a.key, a.model, a.model_label, a.design_id, d.rev
        FROM loe_vd_assignments a JOIN loe_vd_designs d ON d.id = a.design_id]]) or {}
end

function DB.setAssignment(scope, key, model, label, designId, by)
    return MySQL.query.await([[INSERT INTO loe_vd_assignments (scope, `key`, model, model_label, design_id, set_by) VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE model = VALUES(model), model_label = VALUES(model_label), design_id = VALUES(design_id), set_by = VALUES(set_by)]],
        { scope, key, model, label, designId, by })
end

function DB.removeAssignment(scope, key)
    return MySQL.update.await('DELETE FROM loe_vd_assignments WHERE scope = ? AND `key` = ?', { scope, key })
end

function DB.assignmentsOf(designId)
    return MySQL.query.await('SELECT scope, `key`, model, model_label FROM loe_vd_assignments WHERE design_id = ?', { designId }) or {}
end

-- ------------------------------------------------------------------ görseller
function DB.insertImage(owner, data)
    return MySQL.insert.await('INSERT INTO loe_vd_images (owner, data) VALUES (?, ?)', { owner, data })
end

function DB.getImage(id)
    return MySQL.scalar.await('SELECT data FROM loe_vd_images WHERE id = ?', { id })
end
