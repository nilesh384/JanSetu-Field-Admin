import {v2 as cloudinary} from "cloudinary"
import fs from "fs"


cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

const extractPublicIdFromUrl = (url) => {
    const parts = url.split('/');
    const versionIndex = parts.findIndex(part => part.startsWith('v') && !isNaN(part.slice(1)));
    const publicIdWithExtension = parts.slice(versionIndex + 1).join('/');
    const publicId = publicIdWithExtension.replace(/\.[^/.]+$/, ""); // Remove extension
    return publicId;
};

const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null
        //upload the file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto"
        })
        // file has been uploaded successfull
        //console.log("file is uploaded on cloudinary ", response.url);
        try {
            if (fs.existsSync(localFilePath)) {
                fs.unlinkSync(localFilePath)
            }
        } catch (cleanupErr) {
            console.warn('⚠️ Failed to remove temp file after successful upload:', localFilePath, cleanupErr);
        }
        return response;

    } catch (error) {
        // Log the Cloudinary upload error for debugging
        console.error('❌ Cloudinary upload failed for:', localFilePath, error);
        try {
            if (fs.existsSync(localFilePath)) {
                fs.unlinkSync(localFilePath) // remove the locally saved temporary file as the upload operation got failed
            }
        } catch (cleanupErr) {
            console.warn('⚠️ Failed to remove temp file after failed upload:', localFilePath, cleanupErr);
        }
        return null;
    }
}

const deleteOnCloudinary = async (publicId, resourceType = "image") => {
    try {
        const result = await cloudinary.uploader.destroy(publicId,{resource_type: resourceType});
        console.log("Cloudinary file deleted:", result);
        return result; 
    } catch (error) {
        console.error("Failed to delete from Cloudinary:", error);
        return null;
    }
};



export {extractPublicIdFromUrl, uploadOnCloudinary, deleteOnCloudinary}